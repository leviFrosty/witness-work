package expo.modules.speechtranscription

import android.speech.SpeechRecognizer
import expo.modules.kotlin.exception.CodedException

/** A rejection JS maps to a stable code (`index.ts`); never localized text. */
class SpeechException(code: String, message: String) : CodedException(code, message, null)

internal object SpeechErrors {
  const val PERMISSION_DENIED = "ERR_SPEECH_PERMISSION_DENIED"
  const val UNSUPPORTED = "ERR_SPEECH_UNSUPPORTED"
  const val MODEL_UNAVAILABLE = "ERR_SPEECH_MODEL_UNAVAILABLE"
  const val AUDIO_UNAVAILABLE = "ERR_SPEECH_AUDIO_UNAVAILABLE"
  const val BUSY = "ERR_SPEECH_BUSY"
  const val CANCELLED = "ERR_SPEECH_CANCELLED"
  const val FAILED = "ERR_SPEECH_FAILED"

  fun permissionDenied() = SpeechException(PERMISSION_DENIED, "Microphone access is off")

  fun unsupported() =
    SpeechException(UNSUPPORTED, "On-device speech recognition is unavailable for these languages")

  fun modelUnavailable() =
    SpeechException(MODEL_UNAVAILABLE, "The on-device speech model couldn't be installed")

  fun audioUnavailable() = SpeechException(AUDIO_UNAVAILABLE, "The microphone couldn't be started")

  fun busy() = SpeechException(BUSY, "A voice log is already recording")

  fun cancelled() = SpeechException(CANCELLED, "Cancelled")

  /** `error` is the recognizer's code, for logs; JS sees only `FAILED`. */
  fun failed(error: Int? = null) =
    SpeechException(FAILED, "Speech recognition failed" + (error?.let { " (recognizer error $it)" } ?: ""))

  /**
   * The contract's code for a recognizer error that stopped `start`. Network
   * codes land in `FAILED` like everything else: the module never retries
   * through another recognizer.
   */
  fun codeFor(error: Int, cancelled: Boolean): String = when {
    cancelled -> CANCELLED
    error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> PERMISSION_DENIED
    error == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED ||
      error == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> MODEL_UNAVAILABLE
    error == SpeechRecognizer.ERROR_AUDIO -> AUDIO_UNAVAILABLE
    error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> BUSY
    else -> FAILED
  }

  fun forError(error: Int, cancelled: Boolean): SpeechException = when (codeFor(error, cancelled)) {
    CANCELLED -> cancelled()
    PERMISSION_DENIED -> permissionDenied()
    MODEL_UNAVAILABLE -> modelUnavailable()
    AUDIO_UNAVAILABLE -> audioUnavailable()
    BUSY -> busy()
    else -> failed(error)
  }

  /** The recognizer gave up after a pause; listening resumes. */
  fun isSilence(error: Int) =
    error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT

  /**
   * Starting while the system still unbinds the service from a destroyed
   * recognizer fails like this; a fresh recognizer reconnects.
   */
  fun isServiceRace(error: Int) =
    error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_SERVER_DISCONNECTED

  /** A restart can race the previous session's teardown; retry it briefly. */
  fun isRestartRace(error: Int) =
    error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT
}
