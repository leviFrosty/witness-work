import ExpoModulesCore
import Speech

struct StartOptions: Record {
  /// BCP-47 languages to try in order, app language first.
  @Field var localeCandidates: [String] = []
  /// Words to favor, e.g. the user's contact names. Never leave the device.
  @Field var contextualStrings: [String] = []
}

/// One recording at a time; tokens keep a stale session's callbacks inert.
private actor SessionSlot {
  private var current: (token: UUID, session: TranscriptionSession)?

  func claim(_ token: UUID, _ session: TranscriptionSession) throws {
    if current != nil { throw SpeechErrors.busy() }
    current = (token, session)
  }

  func take(_ token: UUID? = nil) -> TranscriptionSession? {
    guard let current, token == nil || current.token == token else { return nil }
    self.current = nil
    return current.session
  }
}

/**
 * On-device speech-to-text for Scribe AI voice logs (ADR 0018). Audio stays in
 * memory and is transcribed on the device: never written to disk, never sent.
 *
 * - iOS 26+: SpeechAnalyzer with SpeechTranscriber, or DictationTranscriber on
 *   hardware without it. Needs only microphone access.
 * - Earlier iOS: SFSpeechRecognizer with `requiresOnDeviceRecognition`. Needs
 *   microphone and speech recognition access.
 *
 * JS drives one session: start → onTranscript… → stop (final text) or cancel.
 * An interruption ends it early and delivers the text through `onEnd`.
 */
public class SpeechTranscriptionModule: Module {
  private let slot = SessionSlot()

  public func definition() -> ModuleDefinition {
    Name("SpeechTranscription")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("speechTranscriptionVersion") {
      1
    }

    Events("onTranscript", "onLevel", "onPreparing", "onEnd")

    AsyncFunction("getAvailability") { (localeCandidates: [String]) async -> [String: Any] in
      guard let engine = await SpeechEngines.resolve(localeCandidates) else {
        return ["available": false]
      }
      return [
        "available": true,
        "locale": engine.locale.identifier(.bcp47),
        "engine": engine.kind.rawValue,
      ]
    }

    AsyncFunction("getPermissions") { () -> [String: Any] in
      SpeechPermissions.current()
    }

    AsyncFunction("requestPermissions") { () async -> [String: Any] in
      await SpeechPermissions.request()
    }

    AsyncFunction("start") { (options: StartOptions) async throws -> [String: Any] in
      guard SpeechPermissions.granted() else { throw SpeechErrors.permissionDenied() }
      guard let engine = await SpeechEngines.resolve(options.localeCandidates) else {
        throw SpeechErrors.unsupported()
      }
      let token = UUID()
      let session = try self.makeSession(
        engine, contextualStrings: options.contextualStrings, token: token)
      try await self.slot.claim(token, session)
      do {
        try await session.start()
      } catch {
        _ = await self.slot.take(token)
        await session.cancel()
        throw error
      }
      return ["locale": engine.locale.identifier(.bcp47), "engine": engine.kind.rawValue]
    }

    AsyncFunction("stop") { () async -> String in
      guard let session = await self.slot.take() else { return "" }
      return await session.stop()
    }

    AsyncFunction("cancel") { () async in
      await self.slot.take()?.cancel()
    }

    OnDestroy {
      let slot = self.slot
      Task { await slot.take()?.cancel() }
    }
  }

  private func makeSession(_ engine: ResolvedEngine, contextualStrings: [String], token: UUID)
    throws -> TranscriptionSession
  {
    let callbacks = SessionCallbacks(
      onTranscript: { [weak self] text in
        self?.sendEvent("onTranscript", ["text": text])
      },
      onLevel: { [weak self] level in
        self?.sendEvent("onLevel", ["level": level])
      },
      onPreparing: { [weak self] progress in
        var payload: [String: Any] = [:]
        if let progress { payload["progress"] = progress }
        self?.sendEvent("onPreparing", payload)
      },
      onInterrupted: { [weak self] in
        Task { await self?.endEarly(token) }
      })
    if #available(iOS 26.0, *), engine.kind != .legacy {
      return AnalyzerTranscription(
        engine: engine, contextualStrings: contextualStrings, callbacks: callbacks)
    }
    guard
      let session = LegacyTranscription(
        engine: engine, contextualStrings: contextualStrings, callbacks: callbacks)
    else { throw SpeechErrors.unsupported() }
    return session
  }

  private func endEarly(_ token: UUID) async {
    guard let session = await slot.take(token) else { return }
    let text = await session.stop()
    sendEvent("onEnd", ["text": text, "reason": "interrupted"])
  }
}
