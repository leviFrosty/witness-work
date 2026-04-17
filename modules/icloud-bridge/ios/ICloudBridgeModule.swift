import ExpoModulesCore
import Foundation

/// Bridges iCloud Drive document sync into JS. Writes and reads a single
/// JSON blob inside the app's ubiquity container using NSFileCoordinator
/// for crash/contention safety, and exposes remote-change events via
/// NSMetadataQuery so JS can pull when another device writes.
///
/// The ubiquity container identifier is resolved via
/// `containerURL(forUbiquityContainerIdentifier: nil)` — iOS returns the
/// first container listed in the app's entitlements, which matches the
/// bundle variant (dev vs. prod) so no runtime selection is needed here.
public class ICloudBridgeModule: Module {
  private static let syncFileName = "witness-work.json"

  private var metadataQuery: NSMetadataQuery?
  private var lastObservedModifiedAt: Date?

  public func definition() -> ModuleDefinition {
    Name("ICloudBridge")

    Events("onRemoteChange", "onAvailabilityChange")

    OnStartObserving {
      self.startMetadataQuery()
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(self.identityDidChange),
        name: NSNotification.Name.NSUbiquityIdentityDidChange,
        object: nil
      )
    }

    OnStopObserving {
      self.stopMetadataQuery()
      NotificationCenter.default.removeObserver(self)
    }

    Function("isAvailable") { () -> Bool in
      return FileManager.default.ubiquityIdentityToken != nil
    }

    Function("getContainerPath") { () -> String? in
      return FileManager.default
        .url(forUbiquityContainerIdentifier: nil)?
        .path
    }

    AsyncFunction("read") { (promise: Promise) in
      guard let containerURL = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      let documentsURL = containerURL.appendingPathComponent("Documents", isDirectory: true)
      let fileURL = documentsURL.appendingPathComponent(ICloudBridgeModule.syncFileName)

      DispatchQueue.global(qos: .utility).async {
        // Step 1: ensure the file is materialized on this device. On the
        // second device in a sync pair, the ubiquity container surfaces the
        // file as a `.icloud` placeholder until iOS has downloaded it.
        // Reading from a placeholder's URL either returns empty or the
        // placeholder metadata — never the real payload. So trigger a
        // download and wait for it to reach `.current` before reading.
        let placeholderURL = documentsURL.appendingPathComponent(".\(ICloudBridgeModule.syncFileName).icloud")

        let fileExists = FileManager.default.fileExists(atPath: fileURL.path)
        let placeholderExists = FileManager.default.fileExists(atPath: placeholderURL.path)

        if !fileExists && !placeholderExists {
          // Nothing to read — no remote file yet.
          promise.resolve(nil)
          return
        }

        // Kick off a download if needed. No-op when already current.
        do {
          try FileManager.default.startDownloadingUbiquitousItem(at: fileURL)
        } catch {
          promise.reject(
            "ICLOUD_DOWNLOAD",
            "Failed to begin iCloud download: \(error.localizedDescription)"
          )
          return
        }

        // Poll the downloading status until it flips to `.current` or the
        // timeout elapses. 10s is generous — first-sync of a small JSON is
        // typically under a second, but backgrounded network or power saving
        // can stretch it. Bail out with a clear error rather than silently
        // reading stale bytes.
        let pollDeadline = Date().addingTimeInterval(10.0)
        var downloadComplete = false
        while Date() < pollDeadline {
          let values = try? fileURL.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
          if values?.ubiquitousItemDownloadingStatus == .current {
            downloadComplete = true
            break
          }
          Thread.sleep(forTimeInterval: 0.2)
        }

        if !downloadComplete {
          promise.reject(
            "ICLOUD_DOWNLOAD_TIMEOUT",
            "iCloud file is still downloading after 10s. The sync file exists remotely but hasn't fully landed on this device yet — try again in a moment."
          )
          return
        }

        // Step 2: coordinated read of the (now-materialized) file.
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var result: ReadResult = .notFound

        coordinator.coordinate(readingItemAt: fileURL, options: [], error: &coordinatorError) { readURL in
          guard FileManager.default.fileExists(atPath: readURL.path) else {
            result = .notFound
            return
          }
          do {
            let data = try Data(contentsOf: readURL)
            let values = try readURL.resourceValues(forKeys: [.contentModificationDateKey])
            let modifiedAt = values.contentModificationDate ?? Date()
            let json = String(data: data, encoding: .utf8) ?? ""
            result = .ok(json: json, modifiedAt: modifiedAt)
          } catch {
            result = .error(message: "Failed to read iCloud file: \(error.localizedDescription)")
          }
        }

        if let err = coordinatorError {
          promise.reject("ICLOUD_COORDINATE", "Coordinator error: \(err.localizedDescription)")
          return
        }

        switch result {
        case .notFound:
          promise.resolve(nil)
        case .ok(let json, let modifiedAt):
          self.lastObservedModifiedAt = modifiedAt
          promise.resolve([
            "json": json,
            "modifiedAt": modifiedAt.timeIntervalSince1970 * 1000,
          ])
        case .error(let message):
          promise.reject("ICLOUD_READ", message)
        }
      }
    }

    AsyncFunction("write") { (json: String, promise: Promise) in
      guard let url = self.syncFileURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      guard let data = json.data(using: .utf8) else {
        promise.reject("ICLOUD_ENCODE", "Could not encode payload as UTF-8")
        return
      }

      DispatchQueue.global(qos: .utility).async {
        // Ensure the Documents directory inside the ubiquity container
        // exists — iOS does not pre-create it.
        let parent = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(
          at: parent,
          withIntermediateDirectories: true
        )

        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var writeResult: Result<Date, Error> = .failure(ICloudBridgeError.unavailable)

        coordinator.coordinate(
          writingItemAt: url,
          options: .forReplacing,
          error: &coordinatorError
        ) { writeURL in
          do {
            try data.write(to: writeURL, options: .atomic)
            let values = try writeURL.resourceValues(forKeys: [.contentModificationDateKey])
            writeResult = .success(values.contentModificationDate ?? Date())
          } catch {
            writeResult = .failure(error)
          }
        }

        if let err = coordinatorError {
          promise.reject("ICLOUD_COORDINATE", "Coordinator error: \(err.localizedDescription)")
          return
        }

        switch writeResult {
        case .success(let modifiedAt):
          self.lastObservedModifiedAt = modifiedAt
          promise.resolve(modifiedAt.timeIntervalSince1970 * 1000)
        case .failure(let error):
          promise.reject("ICLOUD_WRITE", "Failed to write iCloud file: \(error.localizedDescription)")
        }
      }
    }

    AsyncFunction("deleteFile") { (promise: Promise) in
      guard let url = self.syncFileURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }

      DispatchQueue.global(qos: .utility).async {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var deleteError: Error?

        coordinator.coordinate(
          writingItemAt: url,
          options: .forDeleting,
          error: &coordinatorError
        ) { writeURL in
          do {
            if FileManager.default.fileExists(atPath: writeURL.path) {
              try FileManager.default.removeItem(at: writeURL)
            }
          } catch {
            deleteError = error
          }
        }

        if let err = coordinatorError {
          promise.reject("ICLOUD_COORDINATE", "Coordinator error: \(err.localizedDescription)")
          return
        }
        if let err = deleteError {
          promise.reject("ICLOUD_DELETE", "Failed to delete iCloud file: \(err.localizedDescription)")
          return
        }
        self.lastObservedModifiedAt = nil
        promise.resolve(nil)
      }
    }
  }

  // MARK: - File location

  private func syncFileURL() -> URL? {
    guard let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
      return nil
    }
    return container
      .appendingPathComponent("Documents", isDirectory: true)
      .appendingPathComponent(ICloudBridgeModule.syncFileName)
  }

  // MARK: - Remote change observation

  private func startMetadataQuery() {
    guard self.metadataQuery == nil else { return }
    let query = NSMetadataQuery()
    query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
    query.predicate = NSPredicate(
      format: "%K == %@",
      NSMetadataItemFSNameKey,
      ICloudBridgeModule.syncFileName
    )

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(metadataQueryDidUpdate(_:)),
      name: NSNotification.Name.NSMetadataQueryDidFinishGathering,
      object: query
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(metadataQueryDidUpdate(_:)),
      name: NSNotification.Name.NSMetadataQueryDidUpdate,
      object: query
    )

    DispatchQueue.main.async {
      query.start()
    }
    self.metadataQuery = query
  }

  private func stopMetadataQuery() {
    guard let query = self.metadataQuery else { return }
    NotificationCenter.default.removeObserver(self, name: NSNotification.Name.NSMetadataQueryDidFinishGathering, object: query)
    NotificationCenter.default.removeObserver(self, name: NSNotification.Name.NSMetadataQueryDidUpdate, object: query)
    DispatchQueue.main.async {
      query.stop()
    }
    self.metadataQuery = nil
  }

  @objc private func metadataQueryDidUpdate(_ notification: Notification) {
    guard let query = notification.object as? NSMetadataQuery else { return }
    query.disableUpdates()
    defer { query.enableUpdates() }

    var newestModifiedAt: Date?
    for i in 0..<query.resultCount {
      guard let item = query.result(at: i) as? NSMetadataItem else { continue }
      if let date = item.value(forAttribute: NSMetadataItemFSContentChangeDateKey) as? Date {
        if newestModifiedAt == nil || date > newestModifiedAt! {
          newestModifiedAt = date
        }
      }
    }

    // Only emit when the remote-side modification is strictly newer than the
    // most recent write/read we observed locally, so our own writes don't
    // bounce back as remote-change events.
    if let remote = newestModifiedAt,
       self.lastObservedModifiedAt == nil || remote > self.lastObservedModifiedAt! {
      self.lastObservedModifiedAt = remote
      self.sendEvent("onRemoteChange", [
        "modifiedAt": remote.timeIntervalSince1970 * 1000,
      ])
    }
  }

  @objc private func identityDidChange() {
    self.sendEvent("onAvailabilityChange", [
      "available": FileManager.default.ubiquityIdentityToken != nil,
    ])
  }
}

private enum ReadResult {
  case notFound
  case ok(json: String, modifiedAt: Date)
  case error(message: String)
}

enum ICloudBridgeError: Error, CustomStringConvertible {
  case unavailable

  var description: String {
    switch self {
    case .unavailable:
      return "iCloud is unavailable. Verify the user is signed in and the app has iCloud entitlements."
    }
  }
}
