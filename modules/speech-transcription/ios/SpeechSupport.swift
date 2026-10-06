import AVFoundation
import ExpoModulesCore
import Speech

/// Stable codes JS branches on (`index.ts` maps them); never localized text.
enum SpeechErrors {
  static func permissionDenied() -> Exception {
    Exception(
      name: "SpeechPermissionDenied", description: "Microphone or speech access is off",
      code: "ERR_SPEECH_PERMISSION_DENIED")
  }
  static func unsupported(_ cause: Error? = nil) -> Exception {
    let error = Exception(
      name: "SpeechUnsupported",
      description: "On-device speech recognition is unavailable for these languages",
      code: "ERR_SPEECH_UNSUPPORTED")
    error.cause = cause
    return error
  }
  static func modelUnavailable(_ cause: Error? = nil) -> Exception {
    let error = Exception(
      name: "SpeechModelUnavailable", description: "The on-device speech model couldn't be installed",
      code: "ERR_SPEECH_MODEL_UNAVAILABLE")
    error.cause = cause
    return error
  }
  static func audioUnavailable() -> Exception {
    Exception(
      name: "SpeechAudioUnavailable", description: "The microphone couldn't be started",
      code: "ERR_SPEECH_AUDIO_UNAVAILABLE")
  }
  static func busy() -> Exception {
    Exception(
      name: "SpeechBusy", description: "A voice log is already recording", code: "ERR_SPEECH_BUSY")
  }
  static func failed(_ cause: Error? = nil) -> Exception {
    let error = Exception(
      name: "SpeechFailed", description: "Speech recognition failed", code: "ERR_SPEECH_FAILED")
    error.cause = cause
    return error
  }
}

enum SpeechEngineKind: String {
  /// iOS 26+ SpeechAnalyzer with the long-form SpeechTranscriber model.
  case speechTranscriber
  /// iOS 26+ SpeechAnalyzer on hardware without SpeechTranscriber.
  case dictationTranscriber
  /// Before iOS 26: SFSpeechRecognizer forced on-device.
  case legacy
}

struct ResolvedEngine {
  let kind: SpeechEngineKind
  let locale: Locale
}

enum SpeechEngines {
  /// Before iOS 26 only SFSpeechRecognizer exists, and it needs its own
  /// authorization. SpeechAnalyzer runs on-device and needs only the mic.
  static var needsSpeechAuthorization: Bool {
    if #available(iOS 26.0, *) { return false }
    return true
  }

  /// The first candidate language with on-device support wins: the user's
  /// language matters more than which engine serves it.
  static func resolve(_ candidates: [String]) async -> ResolvedEngine? {
    let identifiers = candidateIdentifiers(candidates)
    if #available(iOS 26.0, *) {
      for identifier in identifiers {
        let locale = Locale(identifier: identifier)
        if SpeechTranscriber.isAvailable,
          let supported = await SpeechTranscriber.supportedLocale(equivalentTo: locale),
          await installable(SpeechTranscriber(locale: supported, preset: .progressiveTranscription))
        {
          return ResolvedEngine(kind: .speechTranscriber, locale: supported)
        }
        if let supported = await DictationTranscriber.supportedLocale(equivalentTo: locale),
          await installable(DictationTranscriber(locale: supported, preset: .progressiveLongDictation))
        {
          return ResolvedEngine(kind: .dictationTranscriber, locale: supported)
        }
      }
      return nil
    }
    for identifier in identifiers {
      if let recognizer = SFSpeechRecognizer(locale: Locale(identifier: identifier)),
        recognizer.supportsOnDeviceRecognition
      {
        return ResolvedEngine(kind: .legacy, locale: recognizer.locale)
      }
    }
    return nil
  }

  /// A supported locale can still lack a model this hardware can run, so
  /// require one that is installed or downloadable. This doesn't catch every
  /// case (the simulator passes it), so a failed analyzer start also reports
  /// unsupported.
  @available(iOS 26.0, *)
  private static func installable(_ module: any SpeechModule) async -> Bool {
    await AssetInventory.status(forModules: [module]) != .unsupported
  }

  /// JS passes the app language first; the device's languages follow.
  private static func candidateIdentifiers(_ candidates: [String]) -> [String] {
    var seen = Set<String>()
    return (candidates + Locale.preferredLanguages + [Locale.current.identifier])
      .filter { !$0.isEmpty && seen.insert($0.lowercased()).inserted }
  }
}

enum SpeechPermissions {
  static func current() -> [String: Any] {
    serialize(microphone: microphoneStatus(), speech: speechStatus())
  }

  static func request() async -> [String: Any] {
    if microphoneStatus() == "undetermined" {
      _ = await requestMicrophone()
    }
    if SpeechEngines.needsSpeechAuthorization, speechStatus() == "undetermined" {
      await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        SFSpeechRecognizer.requestAuthorization { _ in continuation.resume() }
      }
    }
    return current()
  }

  static func granted() -> Bool {
    microphoneStatus() == "granted"
      && (!SpeechEngines.needsSpeechAuthorization || speechStatus() == "granted")
  }

  private static func serialize(microphone: String, speech: String) -> [String: Any] {
    let speechRecognition = SpeechEngines.needsSpeechAuthorization ? speech : "notRequired"
    let required = [microphone] + (SpeechEngines.needsSpeechAuthorization ? [speech] : [])
    let status =
      required.contains("denied")
      ? "denied" : required.contains("undetermined") ? "undetermined" : "granted"
    return ["status": status, "microphone": microphone, "speechRecognition": speechRecognition]
  }

  private static func microphoneStatus() -> String {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: return "granted"
      case .denied: return "denied"
      default: return "undetermined"
      }
    }
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted: return "granted"
    case .denied: return "denied"
    default: return "undetermined"
    }
  }

  private static func requestMicrophone() async -> Bool {
    if #available(iOS 17.0, *) {
      return await AVAudioApplication.requestRecordPermission()
    }
    return await withCheckedContinuation { continuation in
      AVAudioSession.sharedInstance().requestRecordPermission { continuation.resume(returning: $0) }
    }
  }

  private static func speechStatus() -> String {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized: return "granted"
    case .denied, .restricted: return "denied"
    default: return "undetermined"
    }
  }
}
