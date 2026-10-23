package expo.modules.speechtranscription

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class StartOptions : Record {
  /** BCP-47 languages to try in order, app language first. */
  @Field val localeCandidates: List<String> = emptyList()

  /** Words to favor, e.g. the user's contact names. Never leave the device. */
  @Field val contextualStrings: List<String> = emptyList()
}

/**
 * On-device speech-to-text for Scribe AI voice logs on Android (ADR 0018).
 * Uses only `SpeechRecognizer.createOnDeviceSpeechRecognizer` (Android 12+):
 * the system's on-device recognition service records and transcribes, and
 * neither audio nor text is sent anywhere. Without an on-device recognizer
 * for the user's languages, `getAvailability` reports unavailable and voice
 * logs fall back to the keyboard; there is no server fallback.
 *
 * JS drives one session: start → onTranscript… → stop (final text) or cancel.
 * An interruption ends it early and delivers the text through `onEnd`.
 */
class SpeechTranscriptionModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // Main thread only. One recording at a time.
  private var current: OnDeviceSession? = null

  /** What an interruption heard, for a `stop()` that crossed its `onEnd`. */
  private var unclaimed: String? = null

  /** The activity is paused (in the background, or under a system dialog). */
  private var paused = false

  override fun definition() = ModuleDefinition {
    Name("SpeechTranscription")

    // JS checks this so OTA updates never call into a binary without the module.
    // 2: playCue.
    Constant("speechTranscriptionVersion") {
      2
    }

    Events("onTranscript", "onLevel", "onPreparing", "onEnd")

    AsyncFunction("getAvailability") Coroutine { localeCandidates: List<String> ->
      withContext(Dispatchers.Main) {
        val language = SpeechAvailability.resolve(context, localeCandidates)
        if (language == null) {
          mapOf("available" to false)
        } else {
          mapOf("available" to true, "locale" to language.locale, "engine" to SpeechAvailability.ENGINE)
        }
      }
    }

    AsyncFunction("getPermissions") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(serialize(fallbackStatus()))
        return@AsyncFunction
      }
      permissions.getPermissions(
        { result -> promise.resolve(serialize(status(result[Manifest.permission.RECORD_AUDIO]))) },
        Manifest.permission.RECORD_AUDIO,
      )
    }

    // Prompts only while Android would still show the prompt.
    AsyncFunction("requestPermissions") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(serialize(fallbackStatus()))
        return@AsyncFunction
      }
      permissions.getPermissions(
        { existing ->
          val before = status(existing[Manifest.permission.RECORD_AUDIO])
          if (before != "undetermined") {
            promise.resolve(serialize(before))
            return@getPermissions
          }
          permissions.askForPermissions(
            { result -> promise.resolve(serialize(status(result[Manifest.permission.RECORD_AUDIO]))) },
            Manifest.permission.RECORD_AUDIO,
          )
        },
        Manifest.permission.RECORD_AUDIO,
      )
    }

    AsyncFunction("start") Coroutine { options: StartOptions ->
      withContext(Dispatchers.Main) { startSession(options) }
    }

    AsyncFunction("stop") Coroutine { ->
      withContext(Dispatchers.Main) { stopSession() }
    }

    AsyncFunction("cancel") Coroutine { ->
      withContext(Dispatchers.Main) { cancelSession() }
    }

    Function("playCue") { uri: String ->
      CuePlayer.play(context, uri)
    }

    // Android stops the microphone for apps in the background; keep what was
    // heard. A start still preparing carries on: the language download asks
    // for consent in a system dialog that pauses the app.
    OnActivityEntersBackground {
      paused = true
      current?.takeIf { it.isListening }?.let { interrupt(it) }
    }

    OnActivityEntersForeground {
      paused = false
    }

    OnDestroy {
      Handler(Looper.getMainLooper()).post { cancelSession() }
    }
  }

  private suspend fun startSession(options: StartOptions): Map<String, Any> {
    if (current != null) throw SpeechErrors.busy()
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      throw SpeechErrors.permissionDenied()
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !SpeechAvailability.isRecognizerAvailable(context)) {
      throw SpeechErrors.unsupported()
    }
    unclaimed = null
    lateinit var session: OnDeviceSession
    session = OnDeviceSession(
      context,
      options.localeCandidates,
      options.contextualStrings,
      SessionCallbacks(
        onTranscript = { text -> sendEvent("onTranscript", mapOf("text" to text)) },
        onLevel = { level -> sendEvent("onLevel", mapOf("level" to level.toDouble())) },
        onPreparing = { progress ->
          sendEvent("onPreparing", if (progress == null) emptyMap() else mapOf("progress" to progress))
        },
        onInterrupted = { interrupt(session) },
      ),
    )
    // Claimed before any recognizer exists, so a second start is busy at once.
    current = session
    val language = try {
      session.start()
    } catch (error: Throwable) {
      if (current === session) current = null
      session.cancel()
      throw error
    }
    // Left while the microphone opened: end it as if it had been listening.
    if (paused) interrupt(session)
    return mapOf("locale" to language.locale, "engine" to SpeechAvailability.ENGINE)
  }

  private suspend fun stopSession(): String {
    val session = current ?: return (unclaimed ?: "").also { unclaimed = null }
    current = null
    if (!session.isListening) {
      session.cancel()
      return ""
    }
    return session.finish()
  }

  private fun cancelSession() {
    unclaimed = null
    val session = current ?: return
    current = null
    session.cancel()
  }

  /** Main thread. Ends `session` early: its text goes to JS through `onEnd`. */
  private fun interrupt(session: OnDeviceSession) {
    if (current !== session) return
    if (!session.isListening) {
      // Focus lost while the microphone opened: `start` rejects instead.
      session.abort(SpeechErrors.audioUnavailable())
      return
    }
    appContext.mainQueue.launch {
      val text = session.finish()
      // stop() or cancel() claimed it while the last words arrived.
      if (current !== session) return@launch
      current = null
      unclaimed = text
      sendEvent("onEnd", mapOf("text" to text, "reason" to "interrupted"))
    }
  }

  /**
   * The contract's tri-state. A denial Android would still prompt for again
   * is `undetermined`, so JS asks instead of sending the user to Settings.
   */
  private fun status(response: PermissionsResponse?): String = when {
    response == null -> fallbackStatus()
    response.status == PermissionsStatus.GRANTED -> "granted"
    response.status == PermissionsStatus.DENIED && !response.canAskAgain -> "denied"
    else -> "undetermined"
  }

  private fun fallbackStatus(): String {
    val granted = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    return if (granted) "granted" else "undetermined"
  }

  // Android's recognizer needs only the microphone.
  private fun serialize(status: String) =
    mapOf("status" to status, "microphone" to status, "speechRecognition" to "notRequired")
}
