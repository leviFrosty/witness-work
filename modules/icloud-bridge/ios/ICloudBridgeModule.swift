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
  /// Separate namespace from the JSON sync files. Binaries live alongside the
  /// per-device JSON payloads in the ubiquity container's `Documents/` dir but
  /// use a distinct `witness-work-img-*.jpg` filename so the two namespaces
  /// never cross — critical because the JSON metadata query predicate matches
  /// only `*.json` and must not fire remote-change events for binary writes.
  /// Phase 2 of iCloud image sync, see docs/icloud-image-sync-plan.md.
  private static let imageFilePrefix = "witness-work-img-"
  private static let imageFileExtension = "jpg"

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

  /// Flipped to `true` the first time `NSMetadataQuery` emits
  /// `DidFinishGathering` for this module's lifetime. Used by
  /// `waitForInitialScan` so the JS layer can avoid racing a fresh-install
  /// probe against iCloud's asynchronous directory materialization — without
  /// this, the first-launch onboarding probe can return "no backup" before
  /// iCloud has surfaced an existing per-device file. Once set, it stays set
  /// even if the query is later stopped and restarted; a completed initial
  /// scan doesn't become incomplete again.
  private var initialGatheringDidFinish: Bool = false
  /// Pending promises from `waitForInitialScan` calls that arrived before the
  /// first `DidFinishGathering`. Resolved all at once when gathering finishes,
  /// or individually by their own timeout timer. Also guarded by `stateQueue`.
  private var pendingScanWaiters: [(Bool) -> Void] = []

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

    /// Resolves `true` once `NSMetadataQuery` has completed at least one full
    /// directory scan of the ubiquity container, or `false` if `timeoutMs`
    /// elapses first. Lets callers (most importantly the onboarding restore
    /// probe on a fresh install) avoid racing iCloud's asynchronous directory
    /// materialization — `contentsOfDirectory` can return empty for several
    /// seconds after launch even when a remote file exists, and a premature
    /// "no backup" verdict is what sends users through onboarding with fresh
    /// timestamps that then beat their real data in the LWW merge.
    ///
    /// Starts the metadata query if it isn't already running — the normal
    /// trigger (`OnStartObserving` when JS adds the first listener) may
    /// happen fractionally later than onboarding's probe on cold launch.
    AsyncFunction("waitForInitialScan") { (timeoutMs: Double, promise: Promise) in
      self.startMetadataQuery()

      // Single-shot resolver shared between the gather notification path and
      // the timeout timer. Whichever fires first wins; subsequent calls are
      // no-ops. The lock protects the `didResolve` check-and-set from the
      // classic TOCTOU where both paths fire within a few microseconds and
      // try to resolve the promise twice.
      let resolveLock = NSLock()
      var didResolve = false
      let tryResolve: (Bool) -> Void = { result in
        resolveLock.lock()
        if didResolve {
          resolveLock.unlock()
          return
        }
        didResolve = true
        resolveLock.unlock()
        promise.resolve(result)
      }

      var alreadyDone = false
      self.stateQueue.sync {
        if self.initialGatheringDidFinish {
          alreadyDone = true
        } else {
          self.pendingScanWaiters.append(tryResolve)
        }
      }

      if alreadyDone {
        tryResolve(true)
        return
      }

      // Arm a timeout. If gathering never completes (e.g. iCloud is
      // unreachable on-device), we still resolve so the caller isn't stuck.
      let deadline = DispatchTime.now() + (timeoutMs / 1000.0)
      DispatchQueue.global().asyncAfter(deadline: deadline) {
        tryResolve(false)
      }
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

    /// Copies a local file at `sourcePath` into the ubiquity container under
    /// the validated `filename` (the `witness-work-img-*.jpg` namespace). Uses
    /// `NSFileCoordinator` for the write so concurrent access from
    /// `NSMetadataQuery` and other file presenters is safe. Returns the
    /// resulting file's modification time in epoch ms.
    ///
    /// File-path transport avoids shipping multi-MB images through the RN
    /// bridge as base64 — the JS layer only ever holds filenames, never
    /// bytes. Source file must be readable; Swift `copyItem` (not `moveItem`)
    /// so the caller's `FileSystem.documentDirectory` copy stays intact.
    AsyncFunction("writeBinary") { (filename: String, sourcePath: String, promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      guard self.isValidImageFilename(filename) else {
        promise.reject("ICLOUD_FILENAME", "Refusing to write outside image namespace: \(filename)")
        return
      }
      let sourceURL = self.fileURL(from: sourcePath)
      let destURL = documentsURL.appendingPathComponent(filename)

      DispatchQueue.global(qos: .utility).async {
        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
          promise.reject("ICLOUD_WRITE_BINARY", "Source file does not exist: \(sourcePath)")
          return
        }

        try? FileManager.default.createDirectory(
          at: documentsURL,
          withIntermediateDirectories: true
        )

        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var writeResult: Result<Date, Error> = .failure(ICloudBridgeError.unavailable)

        coordinator.coordinate(
          writingItemAt: destURL,
          options: .forReplacing,
          error: &coordinatorError
        ) { writeURL in
          do {
            if FileManager.default.fileExists(atPath: writeURL.path) {
              try FileManager.default.removeItem(at: writeURL)
            }
            try FileManager.default.copyItem(at: sourceURL, to: writeURL)
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
          promise.resolve(modifiedAt.timeIntervalSince1970 * 1000)
        case .failure(let error):
          promise.reject("ICLOUD_WRITE_BINARY", "Failed to write image: \(error.localizedDescription)")
        }
      }
    }

    /// Coordinated-read of a binary from the ubiquity container into
    /// `destinationPath` on the local filesystem. Triggers
    /// `startDownloadingUbiquitousItem` for placeholder files and polls up to
    /// 10s for `.current` — mirrors the pattern in `readAll` for JSON files.
    ///
    /// Returns the container file's modification time in epoch ms so the JS
    /// bookkeeping layer can decide whether a later re-download is warranted.
    AsyncFunction("readBinary") { (filename: String, destinationPath: String, promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      guard self.isValidImageFilename(filename) else {
        promise.reject("ICLOUD_FILENAME", "Refusing to read outside image namespace: \(filename)")
        return
      }
      let sourceURL = documentsURL.appendingPathComponent(filename)
      let destURL = self.fileURL(from: destinationPath)

      DispatchQueue.global(qos: .utility).async {
        try? FileManager.default.startDownloadingUbiquitousItem(at: sourceURL)

        // Poll for `.current` status — identical strategy to readAll.
        let deadline = Date().addingTimeInterval(10.0)
        while Date() < deadline {
          let values = try? sourceURL.resourceValues(forKeys: [
            .ubiquitousItemDownloadingStatusKey,
          ])
          if values?.ubiquitousItemDownloadingStatus == .current {
            break
          }
          Thread.sleep(forTimeInterval: 0.2)
        }

        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
          promise.reject("ICLOUD_READ_BINARY_MISSING", "Binary not in container: \(filename)")
          return
        }

        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinatorError: NSError?
        var readResult: Result<Date, Error> = .failure(ICloudBridgeError.unavailable)

        coordinator.coordinate(
          readingItemAt: sourceURL,
          options: [],
          error: &coordinatorError
        ) { readURL in
          do {
            // Ensure parent dir of destination exists.
            let parent = destURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(
              at: parent,
              withIntermediateDirectories: true
            )
            if FileManager.default.fileExists(atPath: destURL.path) {
              try FileManager.default.removeItem(at: destURL)
            }
            try FileManager.default.copyItem(at: readURL, to: destURL)
            let values = try readURL.resourceValues(forKeys: [
              .contentModificationDateKey,
            ])
            readResult = .success(values.contentModificationDate ?? Date())
          } catch {
            readResult = .failure(error)
          }
        }

        if let err = coordinatorError {
          promise.reject("ICLOUD_COORDINATE", "Coordinator error: \(err.localizedDescription)")
          return
        }

        switch readResult {
        case .success(let modifiedAt):
          promise.resolve(modifiedAt.timeIntervalSince1970 * 1000)
        case .failure(let error):
          promise.reject("ICLOUD_READ_BINARY", "Failed to read image: \(error.localizedDescription)")
        }
      }
    }

    /// Enumerates every `witness-work-img-*.jpg` in the ubiquity container.
    /// Returns `[{ filename, modifiedAt }]` so the JS layer can diff by mtime
    /// without a per-file round-trip. Does NOT trigger downloads for
    /// placeholders — the caller drives downloads explicitly via `readBinary`.
    AsyncFunction("listBinaryFiles") { (promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }

      DispatchQueue.global(qos: .utility).async {
        do {
          if !FileManager.default.fileExists(atPath: documentsURL.path) {
            promise.resolve([])
            return
          }
          let contents = try FileManager.default.contentsOfDirectory(
            at: documentsURL,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: []
          )
          var results: [[String: Any]] = []
          for url in contents {
            let name = url.lastPathComponent
            if !self.isValidImageFilename(name) { continue }
            let values = try? url.resourceValues(forKeys: [
              .contentModificationDateKey,
            ])
            let modifiedAt = values?.contentModificationDate ?? Date()
            results.append([
              "filename": name,
              "modifiedAt": modifiedAt.timeIntervalSince1970 * 1000,
            ])
          }
          promise.resolve(results)
        } catch {
          promise.reject(
            "ICLOUD_LIST_BINARY",
            "Failed to enumerate binaries: \(error.localizedDescription)"
          )
        }
      }
    }

    /// Coordinated delete of a single binary file. Idempotent — missing file
    /// resolves successfully so callers don't need to pre-check existence.
    AsyncFunction("deleteBinaryFile") { (filename: String, promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      guard self.isValidImageFilename(filename) else {
        promise.reject("ICLOUD_FILENAME", "Refusing to delete outside image namespace: \(filename)")
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
          promise.reject("ICLOUD_DELETE_BINARY", "Failed to delete binary: \(err.localizedDescription)")
          return
        }
        promise.resolve(nil)
      }
    }

    /// Wipes every `witness-work-img-*.jpg` in the container. Used by the
    /// image-sync disable path to scrub all uploaded avatars in one pass.
    AsyncFunction("deleteAllBinaries") { (promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }

      DispatchQueue.global(qos: .utility).async {
        do {
          if !FileManager.default.fileExists(atPath: documentsURL.path) {
            promise.resolve(nil)
            return
          }
          let contents = try FileManager.default.contentsOfDirectory(
            at: documentsURL,
            includingPropertiesForKeys: [],
            options: []
          )
          let coordinator = NSFileCoordinator(filePresenter: nil)
          var firstError: Error?
          for url in contents where self.isValidImageFilename(url.lastPathComponent) {
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
          if let err = firstError {
            promise.reject(
              "ICLOUD_DELETE_ALL_BINARIES",
              "Failed to delete one or more binaries: \(err.localizedDescription)"
            )
            return
          }
          promise.resolve(nil)
        } catch {
          promise.reject(
            "ICLOUD_DELETE_ALL_BINARIES",
            "Failed to enumerate binaries: \(error.localizedDescription)"
          )
        }
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

  /// Accepts either a `file://` URI (which `expo-file-system` surfaces in JS
  /// as `FileSystem.documentDirectory + filename`) or a plain filesystem
  /// path and returns a `URL` that `FileManager` can use. Using
  /// `URL(fileURLWithPath:)` on a string that already starts with `file://`
  /// produces a bogus URL whose `.path` contains the literal scheme prefix,
  /// so `FileManager.fileExists` returns false and writes silently fail.
  private func fileURL(from pathOrUri: String) -> URL {
    if pathOrUri.hasPrefix("file://") {
      if let parsed = URL(string: pathOrUri) {
        return parsed
      }
    }
    return URL(fileURLWithPath: pathOrUri)
  }

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
    // Exclude the image namespace even though it shares the `witness-work-`
    // prefix — images end in `.jpg`, JSON files end in `.json`, so the suffix
    // check already separates them, but be explicit as belt-and-suspenders.
    if name.hasPrefix(ICloudBridgeModule.imageFilePrefix) { return false }
    return true
  }

  /// Mirror of `src/lib/sync/imageNames.ts :: isValidImageFilename` — keep in
  /// sync. Rejects anything outside the `witness-work-img-*.jpg` namespace,
  /// any path separators / relative components, and empty-middle filenames
  /// like `witness-work-img-.jpg`.
  private func isValidImageFilename(_ name: String) -> Bool {
    guard name.hasPrefix(ICloudBridgeModule.imageFilePrefix) else { return false }
    guard name.hasSuffix(".\(ICloudBridgeModule.imageFileExtension)") else { return false }
    if name.contains("/") || name.contains("..") { return false }
    let middle = String(
      name.dropFirst(ICloudBridgeModule.imageFilePrefix.count)
        .dropLast(ICloudBridgeModule.imageFileExtension.count + 1) // include the '.'
    )
    if middle.isEmpty { return false }
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
      selector: #selector(metadataQueryDidFinishGathering(_:)),
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

  /// Fires once per query lifetime when the initial directory scan completes.
  /// Flips the `initialGatheringDidFinish` flag, resolves any pending
  /// `waitForInitialScan` promises, and then falls through to the standard
  /// update handler so remote-change detection still runs for any files
  /// discovered in the initial gather.
  @objc private func metadataQueryDidFinishGathering(_ notification: Notification) {
    var waitersToResolve: [(Bool) -> Void] = []
    stateQueue.sync {
      if !self.initialGatheringDidFinish {
        self.initialGatheringDidFinish = true
        waitersToResolve = self.pendingScanWaiters
        self.pendingScanWaiters.removeAll()
      }
    }
    // Resolve outside the lock so promise callbacks can't deadlock us.
    for waiter in waitersToResolve { waiter(true) }
    metadataQueryDidUpdate(notification)
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
