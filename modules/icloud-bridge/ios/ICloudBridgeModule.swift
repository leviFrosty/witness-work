import ExpoModulesCore
import Foundation

/// Bridges iCloud Drive document sync into JS. Uses a **per-device file scheme**
/// to sidestep iCloud Drive's cross-device write-conflict behavior: each device
/// owns a file named `witness-work-<deviceId>.json` and only ever writes to
/// that file. Readers enumerate all files matching `witness-work*.json` and
/// merge them in JS. Two devices can never write to the same filename, so
/// iCloud never has a conflict to resolve.
///
/// The ubiquity container identifier is resolved via
/// `containerURL(forUbiquityContainerIdentifier: nil)` — iOS returns the
/// first container listed in the app's entitlements, which matches the
/// bundle variant (dev vs. prod) so no runtime selection is needed here.
public class ICloudBridgeModule: Module {
  private static let syncFilePrefix = "witness-work"
  private static let syncFileExtension = "json"

  private var metadataQuery: NSMetadataQuery?
  /// Per-filename modification dates this device has observed (from its own
  /// writes OR reads). Used to distinguish "this file changed remotely" from
  /// "we just wrote it ourselves" in the metadata query handler.
  ///
  /// Accessed from three contexts: the `.utility` queue (write/readAll/
  /// delete callbacks), the main thread (metadataQueryDidUpdate), and the
  /// module lifecycle hooks. Swift's `Dictionary` is not thread-safe, so all
  /// reads and writes must go through `stateQueue.sync` — concurrent bucket
  /// mutation was crashing the app with an unhandled `CORPSE` in
  /// ReportCrash. Keep these accessors the only way in.
  private var lastObservedModifiedAt: [String: Date] = [:]
  private let stateQueue = DispatchQueue(
    label: "com.witnesswork.icloud-bridge.state"
  )

  private func getLastObserved(_ filename: String) -> Date? {
    return stateQueue.sync { self.lastObservedModifiedAt[filename] }
  }

  private func setLastObserved(_ filename: String, _ date: Date?) {
    stateQueue.sync {
      if let date = date {
        self.lastObservedModifiedAt[filename] = date
      } else {
        self.lastObservedModifiedAt[filename] = nil
      }
    }
  }

  private func clearAllLastObserved() {
    stateQueue.sync { self.lastObservedModifiedAt.removeAll() }
  }

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

    // Reads every `witness-work*.json` file in the ubiquity Documents dir,
    // triggering parallel downloads for any that are still placeholders.
    // Returns one entry per successfully-materialized file. Files still
    // downloading at the 10s deadline are skipped — they'll be picked up on
    // the next pull.
    AsyncFunction("readAll") { (promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }

      DispatchQueue.global(qos: .utility).async {
        do {
          try FileManager.default.createDirectory(
            at: documentsURL,
            withIntermediateDirectories: true
          )

          let urls = try self.listSyncFiles(in: documentsURL)
          if urls.isEmpty {
            promise.resolve([])
            return
          }

          // Kick off downloads for all files concurrently. On the second
          // device in a sync pair, files surface as `.icloud` placeholders
          // until iOS has downloaded them; reading without this first would
          // return empty.
          for url in urls {
            try? FileManager.default.startDownloadingUbiquitousItem(at: url)
          }

          // Poll all files in parallel until each becomes `.current` or the
          // deadline elapses.
          let deadline = Date().addingTimeInterval(10.0)
          var remaining = Set(urls.map { $0.path })
          while Date() < deadline && !remaining.isEmpty {
            for url in urls where remaining.contains(url.path) {
              let values = try? url.resourceValues(forKeys: [
                .ubiquitousItemDownloadingStatusKey,
              ])
              if values?.ubiquitousItemDownloadingStatus == .current {
                remaining.remove(url.path)
              }
            }
            if !remaining.isEmpty {
              Thread.sleep(forTimeInterval: 0.2)
            }
          }

          // Coordinated read of every file that finished downloading.
          var results: [[String: Any]] = []
          let coordinator = NSFileCoordinator(filePresenter: nil)
          for url in urls {
            if remaining.contains(url.path) {
              // Still downloading — skip. The metadata query will fire when
              // it lands and the next pull will read it.
              continue
            }
            var payload: (json: String, modifiedAt: Date)?
            var coordinatorError: NSError?
            coordinator.coordinate(
              readingItemAt: url,
              options: [],
              error: &coordinatorError
            ) { readURL in
              guard FileManager.default.fileExists(atPath: readURL.path) else {
                return
              }
              guard let data = try? Data(contentsOf: readURL) else { return }
              let values = try? readURL.resourceValues(forKeys: [
                .contentModificationDateKey,
              ])
              let modifiedAt = values?.contentModificationDate ?? Date()
              let json = String(data: data, encoding: .utf8) ?? ""
              payload = (json, modifiedAt)
            }
            if let (json, modifiedAt) = payload {
              let filename = url.lastPathComponent
              self.setLastObserved(filename, modifiedAt)
              results.append([
                "filename": filename,
                "json": json,
                "modifiedAt": modifiedAt.timeIntervalSince1970 * 1000,
              ])
            }
          }

          promise.resolve(results)
        } catch {
          promise.reject(
            "ICLOUD_READ_ALL",
            "Failed to enumerate iCloud files: \(error.localizedDescription)"
          )
        }
      }
    }

    AsyncFunction("write") { (filename: String, json: String, promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      guard self.isValidSyncFilename(filename) else {
        promise.reject("ICLOUD_FILENAME", "Refusing to write outside sync namespace: \(filename)")
        return
      }
      guard let data = json.data(using: .utf8) else {
        promise.reject("ICLOUD_ENCODE", "Could not encode payload as UTF-8")
        return
      }

      let fileURL = documentsURL.appendingPathComponent(filename)

      DispatchQueue.global(qos: .utility).async {
        try? FileManager.default.createDirectory(
          at: documentsURL,
          withIntermediateDirectories: true
        )

        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var writeResult: Result<Date, Error> = .failure(ICloudBridgeError.unavailable)

        coordinator.coordinate(
          writingItemAt: fileURL,
          options: .forReplacing,
          error: &coordinatorError
        ) { writeURL in
          do {
            try data.write(to: writeURL, options: .atomic)
            let values = try writeURL.resourceValues(forKeys: [
              .contentModificationDateKey,
            ])
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
          self.setLastObserved(filename, modifiedAt)
          promise.resolve(modifiedAt.timeIntervalSince1970 * 1000)
        case .failure(let error):
          promise.reject("ICLOUD_WRITE", "Failed to write iCloud file: \(error.localizedDescription)")
        }
      }
    }

    AsyncFunction("deleteFile") { (filename: String, promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      guard self.isValidSyncFilename(filename) else {
        promise.reject("ICLOUD_FILENAME", "Refusing to delete outside sync namespace: \(filename)")
        return
      }
      let fileURL = documentsURL.appendingPathComponent(filename)

      DispatchQueue.global(qos: .utility).async {
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var deleteError: Error?

        coordinator.coordinate(
          writingItemAt: fileURL,
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
        self.setLastObserved(filename, nil)
        promise.resolve(nil)
      }
    }

    // Wipes every `witness-work*.json` in the container. Used by the Settings
    // "overwrite remote with this device's data" flow to guarantee the next
    // push isn't shadowed by leftover files from other devices.
    AsyncFunction("deleteAll") { (promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }

      DispatchQueue.global(qos: .utility).async {
        do {
          let urls = try self.listSyncFiles(in: documentsURL)
          let coordinator = NSFileCoordinator(filePresenter: nil)
          var firstError: Error?
          for url in urls {
            var coordinatorError: NSError?
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
                if firstError == nil { firstError = error }
              }
            }
            if let err = coordinatorError, firstError == nil {
              firstError = err
            }
          }
          self.clearAllLastObserved()
          if let err = firstError {
            promise.reject(
              "ICLOUD_DELETE_ALL",
              "Failed to delete one or more files: \(err.localizedDescription)"
            )
            return
          }
          promise.resolve(nil)
        } catch {
          promise.reject(
            "ICLOUD_DELETE_ALL",
            "Failed to enumerate sync files: \(error.localizedDescription)"
          )
        }
      }
    }
  }

  // MARK: - File location

  private func documentsURL() -> URL? {
    guard let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else {
      return nil
    }
    return container.appendingPathComponent("Documents", isDirectory: true)
  }

  private func listSyncFiles(in documentsURL: URL) throws -> [URL] {
    if !FileManager.default.fileExists(atPath: documentsURL.path) {
      return []
    }
    let contents = try FileManager.default.contentsOfDirectory(
      at: documentsURL,
      includingPropertiesForKeys: [
        .contentModificationDateKey,
        .ubiquitousItemDownloadingStatusKey,
      ],
      options: []
    )
    return contents.filter { self.isValidSyncFilename($0.lastPathComponent) }
  }

  /// Matches both the new per-device scheme (`witness-work-<id>.json`) and any
  /// legacy single-file / conflict-duplicate names (`witness-work.json`,
  /// `witness-work 2.json`, …) so the reader can absorb pre-upgrade data.
  /// Rejects path separators and relative components defensively.
  private func isValidSyncFilename(_ name: String) -> Bool {
    guard name.hasPrefix(ICloudBridgeModule.syncFilePrefix) else { return false }
    guard name.hasSuffix(".\(ICloudBridgeModule.syncFileExtension)") else { return false }
    if name.contains("/") || name.contains("..") { return false }
    return true
  }

  // MARK: - Remote change observation

  private func startMetadataQuery() {
    guard self.metadataQuery == nil else { return }
    let query = NSMetadataQuery()
    query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
    query.predicate = NSPredicate(
      format: "%K LIKE %@",
      NSMetadataItemFSNameKey,
      "\(ICloudBridgeModule.syncFilePrefix)*.\(ICloudBridgeModule.syncFileExtension)"
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

    var sawNewerRemote = false
    var newestModifiedAt: Date?
    for i in 0..<query.resultCount {
      guard let item = query.result(at: i) as? NSMetadataItem else { continue }
      guard let filename = item.value(forAttribute: NSMetadataItemFSNameKey) as? String else {
        continue
      }
      guard let date = item.value(forAttribute: NSMetadataItemFSContentChangeDateKey) as? Date else {
        continue
      }

      let lastKnown = self.getLastObserved(filename)
      if lastKnown == nil || date > lastKnown! {
        sawNewerRemote = true
      }
      if newestModifiedAt == nil || date > newestModifiedAt! {
        newestModifiedAt = date
      }
    }

    if sawNewerRemote, let remote = newestModifiedAt {
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

enum ICloudBridgeError: Error, CustomStringConvertible {
  case unavailable

  var description: String {
    switch self {
    case .unavailable:
      return "iCloud is unavailable. Verify the user is signed in and the app has iCloud entitlements."
    }
  }
}
