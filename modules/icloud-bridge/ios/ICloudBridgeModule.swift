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
  /// Photos in notes. Their own prefix, so builds from before note photos
  /// (which accept only `witness-work-img-`) never list, adopt, or clean them
  /// up as orphaned avatars.
  private static let noteImageFilePrefix = "witness-work-note-"
  private static let imageFileExtension = "jpg"

  private var metadataQuery: NSMetadataQuery?
  /// Per-filename modification dates this device has observed (from its own
  /// writes OR reads). Used to distinguish "this file changed remotely" from
  /// "we just wrote it ourselves" in the metadata query handler.
  ///
  /// Accessed from three contexts: the `.utility` queue (write/read/
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
  /// scan doesn't become incomplete again — except after an Apple Account
  /// change, which points the query at a different container.
  private var initialGatheringDidFinish: Bool = false
  /// Pending promises from `waitForInitialScan` calls that arrived before the
  /// first `DidFinishGathering`. Resolved all at once when gathering finishes,
  /// or individually by their own timeout timer. Also guarded by `stateQueue`.
  private var pendingScanWaiters: [UUID: (Bool) -> Void] = [:]
  /// The last identity token archived (`identityTokenArchive`) and the last
  /// `identityTokenMatches` answer, each with the token it was computed from.
  /// `canSync` checks the account before every read and write, so they're
  /// reused, but only while the live token is still `isEqual:` to theirs: a
  /// switch whose `NSUbiquityIdentityDidChange` never arrives (made while the
  /// app was suspended) must not leave the old account's answer in place.
  /// Also guarded by `stateQueue`.
  private var identityArchiveCache: (token: NSObject, archive: Data)?
  private var identityMatchCache: (token: NSObject, stored: String, matches: Bool?)?

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

    /// The archived identity token, base64-encoded, or nil when signed out.
    /// JS stores it to notice a different Apple Account, including a switch
    /// made while the app wasn't running.
    Function("identityToken") { () -> String? in
      return self.identityTokenArchive()?.base64EncodedString()
    }

    /// Whether `stored` (an earlier `identityToken`) is the current Apple
    /// Account, or nil when signed out or `stored` can't be decoded.
    Function("identityTokenMatches") { (stored: String) -> Bool? in
      return self.identityTokenMatches(stored)
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

      let waiterId = UUID()
      var alreadyDone = false
      self.stateQueue.sync {
        if self.initialGatheringDidFinish {
          alreadyDone = true
        } else {
          self.pendingScanWaiters[waiterId] = tryResolve
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
        _ = self.stateQueue.sync { self.pendingScanWaiters.removeValue(forKey: waiterId) }
        tryResolve(false)
      }
    }

    // Reads every `witness-work*.json` file in the ubiquity Documents dir.
    // Superseded by `listFiles` + `readFiles`; kept for JS bundles that
    // predate them (an OTA update onto this build of the same app version).
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
          promise.resolve(self.readSyncFiles(urls).files)
        } catch {
          promise.reject(
            "ICLOUD_READ_ALL",
            "Failed to enumerate iCloud files: \(error.localizedDescription)"
          )
        }
      }
    }

    /// Names of every `witness-work*.json` file in the ubiquity Documents
    /// dir. Downloads nothing and marks nothing observed, so JS can pick the
    /// files it will actually consume before calling `readFiles`.
    AsyncFunction("listFiles") { (promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }

      DispatchQueue.global(qos: .utility).async {
        do {
          let urls = try self.listSyncFiles(in: documentsURL)
          promise.resolve(urls.map { $0.lastPathComponent })
        } catch {
          promise.reject(
            "ICLOUD_LIST",
            "Failed to enumerate iCloud files: \(error.localizedDescription)"
          )
        }
      }
    }

    /// Reads just `filenames`, triggering parallel downloads for any that are
    /// still placeholders. Resolves `{ files, pending }`: one entry per file
    /// read, plus the names still downloading at the 10s deadline (or present
    /// but unreadable). Only files actually read are marked observed, so a
    /// caller reading one file can't swallow the remote-change event for
    /// another file it never consumed.
    AsyncFunction("readFiles") { (filenames: [String], promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.reject(ICloudBridgeError.unavailable)
        return
      }
      if let invalid = filenames.first(where: { !self.isValidSyncFilename($0) }) {
        promise.reject("ICLOUD_FILENAME", "Refusing to read outside sync namespace: \(invalid)")
        return
      }
      let urls = filenames.map { documentsURL.appendingPathComponent($0) }

      DispatchQueue.global(qos: .utility).async {
        let result = self.readSyncFiles(urls)
        promise.resolve([
          "files": result.files,
          "pending": result.pending,
        ])
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

    /// Whether iCloud has uploaded the current version of one sync file — a
    /// coordinated write only proves the bytes reached the local container.
    /// Resolves `{ uploaded, uploading, error: { domain, code } | null }`, or
    /// nil when the container or file is missing. `error` is iCloud's last
    /// upload failure: `NSUbiquitousFileNotUploadedDueToQuotaError` (storage
    /// full) or `NSUbiquitousFileUbiquityServerNotAvailable` (servers out of
    /// reach, usually temporary); iCloud retries the upload itself either way.
    AsyncFunction("uploadStatus") { (filename: String, promise: Promise) in
      guard let documentsURL = self.documentsURL() else {
        promise.resolve(nil)
        return
      }
      guard self.isValidSyncFilename(filename) else {
        promise.reject("ICLOUD_FILENAME", "Refusing to inspect outside sync namespace: \(filename)")
        return
      }

      DispatchQueue.global(qos: .utility).async {
        var url = documentsURL.appendingPathComponent(filename)
        guard FileManager.default.fileExists(atPath: url.path) else {
          promise.resolve(nil)
          return
        }
        // Ubiquity values change underneath us as the daemon uploads; drop
        // anything cached so the answer reflects the daemon's current state.
        url.removeAllCachedResourceValues()
        do {
          let values = try url.resourceValues(forKeys: [
            .ubiquitousItemIsUploadedKey,
            .ubiquitousItemIsUploadingKey,
            .ubiquitousItemUploadingErrorKey,
          ])
          var error: Any = NSNull()
          if let uploadError = values.ubiquitousItemUploadingError {
            error = ["domain": uploadError.domain, "code": uploadError.code]
          }
          promise.resolve([
            "uploaded": values.ubiquitousItemIsUploaded ?? false,
            "uploading": values.ubiquitousItemIsUploading ?? false,
            "error": error,
          ])
        } catch {
          promise.reject(
            "ICLOUD_UPLOAD_STATUS",
            "Failed to read upload status: \(error.localizedDescription)"
          )
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
      // Defense-in-depth: the JS guard in `collectLocalAvatarSources` and the
      // contactImport validator already block foreign source paths from
      // reaching this bridge, but the bridge cannot trust JS. Source must
      // resolve inside the app's own Documents directory — that's where
      // `FileSystem.documentDirectory` (and the only legitimate caller,
      // `pushAllImages`) operates. Anything else would let a malicious
      // contact-import payload turn this bridge into a sandbox-escape
      // primitive: arbitrary file in → user-browsable iCloud Drive out.
      guard self.isInsideAppDocuments(sourceURL) else {
        promise.reject("ICLOUD_WRITE_BINARY_SOURCE", "Source path outside app documents directory: \(sourcePath)")
        return
      }
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
            let data = try Data(contentsOf: sourceURL)
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
          promise.resolve(modifiedAt.timeIntervalSince1970 * 1000)
        case .failure(let error):
          promise.reject("ICLOUD_WRITE_BINARY", "Failed to write image: \(error.localizedDescription)")
        }
      }
    }

    /// Coordinated-read of a binary from the ubiquity container into
    /// `destinationPath` on the local filesystem. Triggers
    /// `startDownloadingUbiquitousItem` for placeholder files and polls up to
    /// 10s for `.current` — mirrors the pattern in `readSyncFiles` for JSON files.
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
      guard self.isInsideAppDocuments(destURL) else {
        promise.reject("ICLOUD_READ_BINARY_DESTINATION", "Destination outside app documents directory")
        return
      }

      let coordinator = NSFileCoordinator(filePresenter: nil)
      let completionLock = NSLock()
      var finished = false
      let isFinished: () -> Bool = {
        completionLock.lock()
        defer { completionLock.unlock() }
        return finished
      }
      let finish: (Result<Date, Error>) -> Void = { result in
        completionLock.lock()
        guard !finished else { completionLock.unlock(); return }
        finished = true
        completionLock.unlock()
        switch result {
        case .success(let modifiedAt):
          promise.resolve(modifiedAt.timeIntervalSince1970 * 1000)
        case .failure(let error):
          promise.reject("ICLOUD_READ_BINARY", "Failed to read image: \(error.localizedDescription)")
        }
      }
      let timeoutError = NSError(domain: "ICloudBridge", code: 408,
        userInfo: [NSLocalizedDescriptionKey: "Photo download timed out"])
      let timeout = DispatchWorkItem {
        finish(.failure(timeoutError))
        coordinator.cancel()
      }
      DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 10, execute: timeout)

      DispatchQueue.global(qos: .utility).async {
        defer { timeout.cancel() }
        try? FileManager.default.startDownloadingUbiquitousItem(at: sourceURL)
        let deadline = ProcessInfo.processInfo.systemUptime + 10
        while ProcessInfo.processInfo.systemUptime < deadline && !isFinished() {
          if self.downloadStatus(of: sourceURL) == .current { break }
          Thread.sleep(forTimeInterval: 0.2)
        }
        guard !isFinished() else { return }
        guard self.downloadStatus(of: sourceURL) == .current else {
          finish(.failure(timeoutError))
          return
        }
        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
          finish(.failure(ICloudBridgeError.unavailable))
          return
        }
        var coordinatorError: NSError?
        var readResult: Result<Date, Error> = .failure(ICloudBridgeError.unavailable)
        coordinator.coordinate(readingItemAt: sourceURL, options: [], error: &coordinatorError) { readURL in
          do {
            guard !isFinished() else { return }
            let data = try Data(contentsOf: readURL)
            guard !isFinished() else { return }
            let temporaryURL = destURL.deletingLastPathComponent()
              .appendingPathComponent(".icloud-download-\(UUID().uuidString).tmp")
            defer { try? FileManager.default.removeItem(at: temporaryURL) }
            try FileManager.default.createDirectory(at: destURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            // Stage slow disk IO outside the settlement lock. A timeout can
            // reject promptly, and an expired read never publishes its bytes.
            try data.write(to: temporaryURL, options: .atomic)
            let values = try readURL.resourceValues(forKeys: [.contentModificationDateKey])
            completionLock.lock()
            defer { completionLock.unlock() }
            guard !finished else { return }
            if FileManager.default.fileExists(atPath: destURL.path) {
              _ = try FileManager.default.replaceItemAt(destURL, withItemAt: temporaryURL)
            } else {
              try FileManager.default.moveItem(at: temporaryURL, to: destURL)
            }
            readResult = .success(values.contentModificationDate ?? Date())
          } catch { readResult = .failure(error) }
        }
        if let error = coordinatorError { finish(.failure(error)) }
        else { finish(readResult) }
      }
    }

    /// Enumerates every photo (`witness-work-img-*.jpg`, `witness-work-note-*.jpg`)
    /// in the ubiquity container.
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

    /// Wipes every photo in the container (avatars and note photos). Used by
    /// the image-sync disable path to scrub everything uploaded in one pass.
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

  /// True when `candidate` resolves inside this app's sandbox Documents
  /// directory — the same path `FileSystem.documentDirectory` returns in JS.
  /// Symlinks are resolved on both sides so the iOS `/private/var` ↔ `/var`
  /// alias can't be used to slip past the prefix check, and `..` segments
  /// are rejected outright before the comparison. The bridge's only
  /// legitimate `writeBinary` caller (`pushAllImages`) always supplies paths
  /// in this directory; anything else is treated as a sandbox-escape attempt.
  private func isInsideAppDocuments(_ candidate: URL) -> Bool {
    let resolvedCandidate = candidate.resolvingSymlinksInPath().standardizedFileURL
    if resolvedCandidate.pathComponents.contains("..") { return false }
    guard let docsURL = try? FileManager.default.url(
      for: .documentDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: false
    ) else {
      return false
    }
    let resolvedDocs = docsURL.resolvingSymlinksInPath().standardizedFileURL
    let docsPath = resolvedDocs.path.hasSuffix("/")
      ? resolvedDocs.path
      : resolvedDocs.path + "/"
    return resolvedCandidate.path.hasPrefix(docsPath)
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

  /// Downloads (where needed) and reads `urls`, recording each read's content
  /// date as observed so the metadata query only reports versions this device
  /// hasn't consumed. Blocking — call off the main thread. Files still
  /// downloading at the 10s deadline, or present but unreadable, come back in
  /// `pending`, unread and unobserved, so the metadata query reports them
  /// again once they land.
  private func readSyncFiles(_ urls: [URL]) -> (files: [[String: Any]], pending: [String]) {
    // Kick off downloads for all files concurrently. On the second device in a
    // sync pair, files surface as placeholders until iOS has downloaded them;
    // reading without this first would return empty.
    for url in urls {
      try? FileManager.default.startDownloadingUbiquitousItem(at: url)
    }

    // Poll all files in parallel until each becomes `.current` or the
    // deadline elapses.
    let deadline = Date().addingTimeInterval(10.0)
    var remaining = Set(urls.map { $0.path })
    while Date() < deadline && !remaining.isEmpty {
      for url in urls where remaining.contains(url.path) {
        if self.downloadStatus(of: url) == .current {
          remaining.remove(url.path)
        }
      }
      if !remaining.isEmpty {
        Thread.sleep(forTimeInterval: 0.2)
      }
    }

    // Coordinated read of every file that finished downloading.
    var files: [[String: Any]] = []
    var pending: [String] = []
    let coordinator = NSFileCoordinator(filePresenter: nil)
    for url in urls {
      let filename = url.lastPathComponent
      if remaining.contains(url.path) {
        pending.append(filename)
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
        // Fresh URL: the enumerated one may carry a pre-download date.
        let values = try? self.uncachedURL(readURL).resourceValues(forKeys: [
          .contentModificationDateKey,
        ])
        let modifiedAt = values?.contentModificationDate ?? Date()
        let json = String(data: data, encoding: .utf8) ?? ""
        payload = (json, modifiedAt)
      }
      if let (json, modifiedAt) = payload {
        self.setLastObserved(filename, modifiedAt)
        files.append([
          "filename": filename,
          "json": json,
          "modifiedAt": modifiedAt.timeIntervalSince1970 * 1000,
        ])
      } else if FileManager.default.fileExists(atPath: url.path) {
        pending.append(filename)
      }
    }
    return (files, pending)
  }

  /// `URL.resourceValues` answers from a cache on the URL object that is only
  /// flushed between run-loop passes — never, on the GCD queues these reads
  /// run on — and `listSyncFiles` pre-fetches the download status into that
  /// cache. Polling the same URL kept reporting the enumeration-time status,
  /// so a download that finished mid-poll still looked unfinished and the
  /// file was skipped. A new URL object has no cache.
  private func uncachedURL(_ url: URL) -> URL {
    return URL(fileURLWithPath: url.path, isDirectory: false)
  }

  private func downloadStatus(of url: URL) -> URLUbiquitousItemDownloadingStatus? {
    return try? uncachedURL(url)
      .resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey])
      .ubiquitousItemDownloadingStatus
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

  /// Mirror of `src/app/sync/imageNames.ts :: isValidImageFilename` — keep in
  /// sync. Rejects anything outside the `witness-work-img-*.jpg` (avatars) and
  /// `witness-work-note-*.jpg` (note photos) namespaces, any path separators /
  /// relative components, and empty-middle filenames like
  /// `witness-work-img-.jpg`.
  private func isValidImageFilename(_ name: String) -> Bool {
    let prefix: String
    if name.hasPrefix(ICloudBridgeModule.imageFilePrefix) {
      prefix = ICloudBridgeModule.imageFilePrefix
    } else if name.hasPrefix(ICloudBridgeModule.noteImageFilePrefix) {
      prefix = ICloudBridgeModule.noteImageFilePrefix
    } else {
      return false
    }
    guard name.hasSuffix(".\(ICloudBridgeModule.imageFileExtension)") else { return false }
    if name.contains("/") || name.contains("..") { return false }
    let middle = String(
      name.dropFirst(prefix.count)
        .dropLast(ICloudBridgeModule.imageFileExtension.count + 1) // include the '.'
    )
    if middle.isEmpty { return false }
    return true
  }

  // MARK: - Remote change observation

  private func startMetadataQuery() {
    DispatchQueue.main.async {
      guard self.metadataQuery == nil else { return }
      let query = NSMetadataQuery()
      query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
      query.predicate = NSPredicate(
        format: "%K LIKE %@", NSMetadataItemFSNameKey,
        "\(ICloudBridgeModule.syncFilePrefix)*.\(ICloudBridgeModule.syncFileExtension)"
      )
      NotificationCenter.default.addObserver(self, selector: #selector(self.metadataQueryDidFinishGathering(_:)), name: NSNotification.Name.NSMetadataQueryDidFinishGathering, object: query)
      NotificationCenter.default.addObserver(self, selector: #selector(self.metadataQueryDidUpdate(_:)), name: NSNotification.Name.NSMetadataQueryDidUpdate, object: query)
      self.metadataQuery = query
      query.start()
    }
  }

  private func stopMetadataQuery() {
    DispatchQueue.main.async {
      guard let query = self.metadataQuery else { return }
      NotificationCenter.default.removeObserver(self, name: NSNotification.Name.NSMetadataQueryDidFinishGathering, object: query)
      NotificationCenter.default.removeObserver(self, name: NSNotification.Name.NSMetadataQueryDidUpdate, object: query)
      query.stop()
      self.metadataQuery = nil
    }
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
        waitersToResolve = Array(self.pendingScanWaiters.values)
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

  /// The identity token archived the way Apple documents for persisting it.
  /// The token is opaque, so its archive is only ever compared through
  /// `identityTokenMatches`, never byte for byte.
  private func identityTokenArchive() -> Data? {
    guard let token = FileManager.default.ubiquityIdentityToken as? NSObject else {
      return nil
    }
    if let cached = stateQueue.sync(execute: { self.identityArchiveCache }),
       cached.token.isEqual(token) {
      return cached.archive
    }
    guard let archive = try? NSKeyedArchiver.archivedData(
      withRootObject: token,
      requiringSecureCoding: false
    ) else {
      return nil
    }
    stateQueue.sync { self.identityArchiveCache = (token, archive) }
    return archive
  }

  private func identityTokenMatches(_ stored: String) -> Bool? {
    guard let token = FileManager.default.ubiquityIdentityToken as? NSObject else {
      return nil
    }
    if let cached = stateQueue.sync(execute: { self.identityMatchCache }),
       cached.stored == stored,
       cached.token.isEqual(token) {
      return cached.matches
    }
    let matches = compareIdentityToken(stored, with: token)
    stateQueue.sync { self.identityMatchCache = (token, stored, matches) }
    return matches
  }

  /// Apple documents `isEqual:` for comparing identity tokens. Archives of one
  /// token aren't guaranteed to stay byte-identical across iOS versions, and a
  /// false "account changed" would turn sync off.
  private func compareIdentityToken(_ stored: String, with current: NSObject) -> Bool? {
    guard let data = Data(base64Encoded: stored),
          let unarchiver = try? NSKeyedUnarchiver(forReadingFrom: data) else {
      return nil
    }
    // Written by this app into its own device-local preferences.
    unarchiver.requiresSecureCoding = false
    let decoded = unarchiver.decodeObject(forKey: NSKeyedArchiveRootObjectKey)
    unarchiver.finishDecoding()
    guard let previous = decoded as? NSObject else { return nil }
    return previous.isEqual(current)
  }

  /// A different account means a different container: observed dates and the
  /// initial-scan flag describe the old one, so forget them and rescan before
  /// telling JS, which checks the account before any further read or write.
  @objc private func identityDidChange() {
    clearAllLastObserved()
    stateQueue.sync {
      self.initialGatheringDidFinish = false
      self.identityArchiveCache = nil
      self.identityMatchCache = nil
    }
    stopMetadataQuery()
    startMetadataQuery()
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
