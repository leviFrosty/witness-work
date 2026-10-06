import AVFoundation
import ExpoModulesCore
import Speech

/// What a running session reports back to the module (and on to JS).
struct SessionCallbacks {
  /// The whole transcript so far: finalized text plus the in-progress guess.
  let onTranscript: (String) -> Void
  let onLevel: (Float) -> Void
  /// The OS is downloading Apple's speech model; `nil` progress is unknown.
  let onPreparing: (Double?) -> Void
  /// Capture ended without the user asking (a call, a route change, an error).
  let onInterrupted: () -> Void
}

protocol TranscriptionSession: AnyObject, Sendable {
  func start() async throws
  /// Ends capture, waits for the recognizer to finalize, returns the text.
  func stop() async -> String
  func cancel() async
}

/// Thread-safe flag for "the user cancelled while start() was awaiting".
final class CancelFlag: @unchecked Sendable {
  private let lock = NSLock()
  private var value = false
  var isSet: Bool { lock.withLock { value } }
  func set() { lock.withLock { value = true } }
}

func cancelledError() -> Exception {
  Exception(name: "SpeechCancelled", description: "Cancelled", code: "ERR_SPEECH_CANCELLED")
}

/**
 * iOS 26+: SpeechAnalyzer. Runs entirely on-device; the only network use is
 * the OS fetching Apple's language model for the locale the first time.
 */
@available(iOS 26.0, *)
final class AnalyzerTranscription: TranscriptionSession, @unchecked Sendable {
  private enum Transcriber {
    case speech(SpeechTranscriber)
    case dictation(DictationTranscriber)

    var module: any SpeechModule {
      switch self {
      case .speech(let transcriber): return transcriber
      case .dictation(let transcriber): return transcriber
      }
    }
  }

  private let transcriber: Transcriber
  private let contextualStrings: [String]
  private let callbacks: SessionCallbacks
  private let capture = AudioCapture()
  private let cancelled = CancelFlag()
  private var analyzer: SpeechAnalyzer?
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var resultsTask: Task<Void, Never>?
  // Only the results task writes these; stop() reads them after it ends.
  private var finalized = ""
  private var volatile = ""

  init(engine: ResolvedEngine, contextualStrings: [String], callbacks: SessionCallbacks) {
    switch engine.kind {
    case .dictationTranscriber:
      transcriber = .dictation(
        DictationTranscriber(
          locale: engine.locale, contentHints: [], transcriptionOptions: [.punctuation],
          reportingOptions: [.volatileResults, .frequentFinalization], attributeOptions: []))
    default:
      transcriber = .speech(
        SpeechTranscriber(locale: engine.locale, preset: .progressiveTranscription))
    }
    self.contextualStrings = contextualStrings
    self.callbacks = callbacks
  }

  func start() async throws {
    let modules = [transcriber.module]
    do {
      if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
        callbacks.onPreparing(nil)
        let observation = request.progress.observe(\.fractionCompleted) {
          [callbacks] progress, _ in callbacks.onPreparing(progress.fractionCompleted)
        }
        defer { observation.invalidate() }
        try await request.downloadAndInstall()
      }
    } catch {
      throw SpeechErrors.modelUnavailable(error)
    }
    if cancelled.isSet { throw cancelledError() }

    let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: modules)
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    let analyzer = SpeechAnalyzer(modules: modules)
    self.analyzer = analyzer
    input = continuation
    if !contextualStrings.isEmpty {
      // Biases recognition toward the user's own contact names. Stays on-device.
      let context = AnalysisContext()
      context.contextualStrings[.general] = contextualStrings
      try? await analyzer.setContext(context)
    }
    resultsTask = consumeResults()
    do {
      try await analyzer.prepareToAnalyze(in: format)
      try await analyzer.start(inputSequence: stream)
    } catch {
      // The installed model can't serve this locale or task on this hardware.
      await cancel()
      throw SpeechErrors.unsupported(error)
    }
    if cancelled.isSet { throw cancelledError() }

    capture.onLevel = callbacks.onLevel
    capture.onInterrupted = callbacks.onInterrupted
    do {
      try capture.start(targetFormat: format) { buffer in
        continuation.yield(AnalyzerInput(buffer: buffer))
      }
    } catch {
      await cancel()
      throw error
    }
  }

  func stop() async -> String {
    capture.stop()
    input?.finish()
    try? await analyzer?.finalizeAndFinishThroughEndOfInput()
    await resultsTask?.value
    return transcript
  }

  func cancel() async {
    cancelled.set()
    capture.stop()
    input?.finish()
    await analyzer?.cancelAndFinishNow()
    resultsTask?.cancel()
  }

  private var transcript: String {
    (finalized + volatile).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func consumeResults() -> Task<Void, Never> {
    let transcriber = transcriber
    return Task { [weak self] in
      do {
        switch transcriber {
        case .speech(let module):
          for try await result in module.results {
            self?.handle(String(result.text.characters), isFinal: result.isFinal)
          }
        case .dictation(let module):
          for try await result in module.results {
            self?.handle(String(result.text.characters), isFinal: result.isFinal)
          }
        }
      } catch {
        // Recognition stopped on its own; keep what was finalized.
        if let self, !self.cancelled.isSet { self.callbacks.onInterrupted() }
      }
    }
  }

  private func handle(_ text: String, isFinal: Bool) {
    if isFinal {
      finalized += text
      volatile = ""
    } else {
      volatile = text
    }
    callbacks.onTranscript(transcript)
  }
}

/**
 * Before iOS 26: SFSpeechRecognizer with `requiresOnDeviceRecognition`, so
 * audio is never sent to Apple's servers. Only offered for locales whose
 * on-device model is present (see `SpeechEngines.resolve`).
 */
final class LegacyTranscription: TranscriptionSession, @unchecked Sendable {
  private let recognizer: SFSpeechRecognizer
  private let request = SFSpeechAudioBufferRecognitionRequest()
  private let callbacks: SessionCallbacks
  private let capture = AudioCapture()
  private let lock = NSLock()
  private var task: SFSpeechRecognitionTask?
  private var text = ""
  private var stopping = false
  private var finished = false
  private var waiter: CheckedContinuation<Void, Never>?

  init?(engine: ResolvedEngine, contextualStrings: [String], callbacks: SessionCallbacks) {
    guard let recognizer = SFSpeechRecognizer(locale: engine.locale),
      recognizer.supportsOnDeviceRecognition
    else { return nil }
    self.recognizer = recognizer
    self.callbacks = callbacks
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = true
    request.addsPunctuation = true
    request.taskHint = .dictation
    request.contextualStrings = contextualStrings
  }

  func start() async throws {
    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      self?.handle(result, error)
    }
    capture.onLevel = callbacks.onLevel
    capture.onInterrupted = callbacks.onInterrupted
    let request = request
    do {
      try capture.start(targetFormat: nil) { buffer in request.append(buffer) }
    } catch {
      task?.cancel()
      throw error
    }
  }

  func stop() async -> String {
    lock.withLock { stopping = true }
    capture.stop()
    request.endAudio()
    await waitForFinal(seconds: 3)
    task?.cancel()
    return lock.withLock { text }.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  func cancel() async {
    lock.withLock { stopping = true }
    capture.stop()
    task?.cancel()
    resolveWaiter()
  }

  private func handle(_ result: SFSpeechRecognitionResult?, _ error: Error?) {
    if let result {
      let snapshot = result.bestTranscription.formattedString
      lock.withLock { text = snapshot }
      callbacks.onTranscript(snapshot)
    }
    guard error != nil || result?.isFinal == true else { return }
    let wasStopping = lock.withLock { stopping }
    resolveWaiter()
    if !wasStopping { callbacks.onInterrupted() }
  }

  private func resolveWaiter() {
    let waiter: CheckedContinuation<Void, Never>? = lock.withLock {
      finished = true
      defer { self.waiter = nil }
      return self.waiter
    }
    waiter?.resume()
  }

  private func waitForFinal(seconds: Double) async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      let alreadyFinished: Bool = lock.withLock {
        if finished { return true }
        waiter = continuation
        return false
      }
      if alreadyFinished {
        continuation.resume()
        return
      }
      DispatchQueue.global().asyncAfter(deadline: .now() + seconds) { [weak self] in
        self?.resolveWaiter()
      }
    }
  }
}
