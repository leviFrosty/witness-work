package expo.modules.speechtranscription

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/** What a running session reports back to the module (and on to JS). */
internal class SessionCallbacks(
  /** The whole transcript so far: finalized segments plus the in-progress guess. */
  val onTranscript: (String) -> Unit,
  val onLevel: (Float) -> Unit,
  /** The on-device model is downloading; null progress is unknown. */
  val onPreparing: (Double?) -> Unit,
  /** Listening ended without the user asking (a recognizer error, a call). */
  val onInterrupted: () -> Unit,
)

/**
 * One voice log on Android's on-device recognizer (API 31+). The system's
 * on-device recognition service records and transcribes; audio never reaches
 * this process, and nothing is written to disk or sent.
 *
 * The recognizer ends a session at a pause, so listening continues until the
 * user stops: Android 13+ asks for one long segmented session, and any session
 * that ends anyway restarts. Finalized segments are joined with spaces.
 *
 * Main thread only, like SpeechRecognizer.
 */
internal class OnDeviceSession(
  private val context: Context,
  private val localeCandidates: List<String>,
  contextualStrings: List<String>,
  private val callbacks: SessionCallbacks,
) {
  private val handler = Handler(Looper.getMainLooper())
  private val clock: () -> Long = SystemClock::elapsedRealtime
  private val biasing = biasingStrings(contextualStrings)
  private var intent = Intent()
  private val transcript = TranscriptAccumulator()
  private val meter = LevelMeter(clock)
  private val transcriptThrottle = Throttle(TRANSCRIPT_INTERVAL_MS)
  private val finished = CompletableDeferred<String>()
  private var abandonFocus: () -> Unit = {}
  private var recognizer: SpeechRecognizer? = null
  private var work: Job? = null
  private var abortError: SpeechException? = null
  private var readyWaiter: CancellableContinuation<Unit>? = null

  /** The first session is listening, so `start` has resolved (or is about to). */
  var isListening = false
    private set

  /** A recognizer session runs: from `startListening` until it ends. */
  private var active = false
  private var restarting = false
  private var restartRetries = 0
  private var listenedAt = 0L
  private var stopping = false
  private var closed = false
  private var publishScheduled = false
  private var published = ""

  private val listenTask = Runnable { if (!stopping && !closed) listen() }
  private val publishTask = Runnable {
    publishScheduled = false
    sendTranscript()
  }

  /**
   * Picks the language, downloads its model if needed, and returns once the
   * recognizer listens.
   */
  @RequiresApi(Build.VERSION_CODES.S)
  suspend fun start(): ResolvedLanguage = coroutineScope {
    val job = async { prepareAndListen() }
    work = job
    try {
      job.await()
    } catch (error: CancellationException) {
      throw abortError ?: error
    } finally {
      work = null
    }
  }

  /** Stops listening, waits briefly for the last words, and returns the text. */
  suspend fun finish(): String {
    if (!stopping) {
      stopping = true
      handler.removeCallbacks(listenTask)
      if (active) {
        recognizer?.stopListening()
        handler.postDelayed({ complete() }, FINAL_RESULT_WAIT_MS)
      } else {
        complete()
      }
    }
    return finished.await()
  }

  fun cancel() = abort(SpeechErrors.cancelled())

  /** Ends the session at once; a `start` still in progress rejects with `error`. */
  fun abort(error: SpeechException) {
    if (closed) return
    stopping = true
    abortError = error
    work?.cancel()
    release()
    finished.complete(transcript.text)
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private suspend fun prepareAndListen(): ResolvedLanguage {
    // The language check runs on this session's recognizer: a recognizer of
    // its own, destroyed just before listening, can unbind the service.
    var recognizer = newRecognizer()
    var language = SpeechAvailability.resolve(context, localeCandidates, recognizer)
    if (language == null) {
      // JS starts only after `getAvailability` said yes, so this is most
      // likely the service reconnecting. Ask once more before giving up.
      recognizer = replaceRecognizer()
      language = SpeechAvailability.resolve(context, localeCandidates, recognizer)
        ?: throw SpeechErrors.unsupported()
    }
    intent = recognizeIntent(context.packageName, language.locale, biasing)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      (language.model == ModelState.PENDING || language.model == ModelState.DOWNLOADABLE)
    ) {
      SpeechAvailability.install(context, recognizer, intent, language.locale, callbacks.onPreparing)
    }
    val focus = AudioFocus(context) { if (!stopping && !closed) callbacks.onInterrupted() }
    abandonFocus = focus::abandon
    if (!focus.request()) throw SpeechErrors.audioUnavailable()
    var attempt = 0
    while (true) {
      try {
        awaitReady()
        return language
      } catch (error: ServiceUnavailable) {
        // The service was still unbinding from a recognizer another caller
        // just destroyed. A fresh recognizer reconnects.
        if (++attempt > MAX_START_RETRIES) throw SpeechErrors.failed(error.code)
        replaceRecognizer()
      }
    }
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private suspend fun replaceRecognizer(): SpeechRecognizer {
    recognizer?.destroy()
    recognizer = null
    delay(START_RETRY_MS)
    return newRecognizer()
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun newRecognizer(): SpeechRecognizer {
    val recognizer = SpeechAvailability.createRecognizer(context) ?: throw SpeechErrors.unsupported()
    recognizer.setRecognitionListener(Listener(recognizer))
    this.recognizer = recognizer
    return recognizer
  }

  private suspend fun awaitReady() {
    withTimeoutOrNull(READY_TIMEOUT_MS) {
      suspendCancellableCoroutine<Unit> { continuation ->
        readyWaiter = continuation
        continuation.invokeOnCancellation { readyWaiter = null }
        listen()
      }
    } ?: throw SpeechErrors.failed()
  }

  private fun listen() {
    active = true
    listenedAt = clock()
    recognizer?.startListening(intent)
  }

  private fun markReady() {
    if (closed) return
    restarting = false
    restartRetries = 0
    if (isListening) return
    isListening = true
    readyWaiter?.let {
      readyWaiter = null
      it.resume(Unit)
    }
  }

  /** `onResults` or `onEndOfSegmentedSession`: the recognizer session is over. */
  private fun sessionEnded() {
    if (closed) return
    val wasActive = active
    active = false
    if (stopping) return complete()
    if (!wasActive) return
    markReady()
    restart()
  }

  private fun handleError(error: Int) {
    if (closed) return
    if (!SpeechErrors.isSilence(error)) Log.w(TAG, "Recognizer error $error")
    if (!isListening) {
      val waiter = readyWaiter ?: return
      readyWaiter = null
      active = false
      val retry = !stopping && SpeechErrors.isServiceRace(error)
      waiter.resumeWithException(
        if (retry) ServiceUnavailable(error) else SpeechErrors.forError(error, cancelled = stopping),
      )
      return
    }
    val wasActive = active
    active = false
    if (stopping) return complete()
    // A late error from a session that already ended.
    if (!wasActive) return
    if (restarting && SpeechErrors.isRestartRace(error) && restartRetries < MAX_RESTART_RETRIES) {
      restartRetries++
      return scheduleListen(RESTART_RETRY_MS)
    }
    if (SpeechErrors.isSilence(error)) return restart()
    callbacks.onInterrupted()
  }

  private fun restart() {
    transcript.commitPartial()
    publish()
    // A session that ends at once shouldn't spin the recognizer.
    val quick = clock() - listenedAt < QUICK_SESSION_MS
    scheduleListen(if (quick) QUICK_RESTART_DELAY_MS else 0L)
  }

  /** Posted, never inline: starting from inside a callback can report busy. */
  private fun scheduleListen(delayMs: Long) {
    restarting = true
    handler.postDelayed(listenTask, delayMs)
  }

  private fun complete() {
    if (closed) return
    transcript.commitPartial()
    release()
    finished.complete(transcript.text)
  }

  private fun release() {
    closed = true
    handler.removeCallbacksAndMessages(null)
    abandonFocus()
    abandonFocus = {}
    recognizer?.let {
      it.cancel()
      SpeechAvailability.releaseLater(it)
    }
    recognizer = null
  }

  private fun publish() {
    if (closed || publishScheduled) return
    val wait = transcriptThrottle.delay(clock())
    if (wait > 0) {
      publishScheduled = true
      handler.postDelayed(publishTask, wait)
    } else {
      sendTranscript()
    }
  }

  private fun sendTranscript() {
    val text = transcript.text
    if (closed || text == published) return
    published = text
    transcriptThrottle.sent(clock())
    callbacks.onTranscript(text)
  }

  /** Callbacks from `owner` only; a replaced or released recognizer is ignored. */
  private inner class Listener(private val owner: SpeechRecognizer) : RecognitionListener {
    private val current get() = !closed && owner === recognizer

    override fun onReadyForSpeech(params: Bundle?) {
      if (current) markReady()
    }

    override fun onBeginningOfSpeech() {
      if (current) markReady()
    }

    override fun onRmsChanged(rmsdB: Float) {
      if (!current || !isListening || stopping) return
      meter.add(rmsdB)?.let(callbacks.onLevel)
    }

    override fun onBufferReceived(buffer: ByteArray?) = Unit

    override fun onEndOfSpeech() = Unit

    override fun onError(error: Int) {
      if (current) handleError(error)
    }

    override fun onPartialResults(partialResults: Bundle?) {
      if (!current) return
      markReady()
      transcript.partial(topResult(partialResults))
      publish()
    }

    override fun onResults(results: Bundle?) {
      if (!current) return
      transcript.commit(topResult(results))
      publish()
      sessionEnded()
    }

    override fun onSegmentResults(segmentResults: Bundle) {
      if (!current) return
      transcript.commit(topResult(segmentResults))
      publish()
    }

    override fun onEndOfSegmentedSession() {
      if (current) sessionEnded()
    }

    override fun onEvent(eventType: Int, params: Bundle?) = Unit
  }

  /** The first listen hit a service that was still unbinding. */
  private class ServiceUnavailable(val code: Int) : Exception("Recognizer error $code")

  private companion object {
    const val TAG = "SpeechTranscription"
    const val TRANSCRIPT_INTERVAL_MS = 250L
    const val READY_TIMEOUT_MS = 10_000L
    const val FINAL_RESULT_WAIT_MS = 2_000L
    const val QUICK_SESSION_MS = 1_000L
    const val QUICK_RESTART_DELAY_MS = 300L
    const val RESTART_RETRY_MS = 250L
    const val MAX_RESTART_RETRIES = 3
    const val START_RETRY_MS = 300L
    const val MAX_START_RETRIES = 2

    /**
     * How long one segmented session lasts before it ends at a pause (and
     * restarts). Google's on-device service ignores segmenting above 5 min.
     */
    const val SEGMENTED_SESSION_MS = 5 * 60 * 1000

    fun topResult(bundle: Bundle?): String =
      bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()

    fun recognizeIntent(packageName: String, locale: String, biasing: List<String>) =
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          // Contact names to favor. Best effort: recognizers may ignore them.
          if (biasing.isNotEmpty()) {
            putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, ArrayList(biasing))
          }
          putExtra(RecognizerIntent.EXTRA_ENABLE_FORMATTING, RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY)
          putExtra(
            RecognizerIntent.EXTRA_SEGMENTED_SESSION,
            RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS,
          )
          // An Int: Google's on-device service reads it with getInt and ignores
          // the segmented session when the value isn't positive.
          putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, SEGMENTED_SESSION_MS)
        }
      }
  }
}

/**
 * Ducks other audio while recording, as iOS does. Losing focus outright (a
 * call, another app recording or playing) ends the voice log.
 */
@RequiresApi(Build.VERSION_CODES.O)
private class AudioFocus(context: Context, private val onLost: () -> Unit) {
  private val manager = context.getSystemService(AudioManager::class.java)
  private val request =
    AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ASSISTANT)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      .setOnAudioFocusChangeListener(
        { change ->
          if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            onLost()
          }
        },
        Handler(Looper.getMainLooper()),
      )
      .build()
  private var held = false

  fun request(): Boolean {
    val manager = manager ?: return true
    held = manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return held
  }

  fun abandon() {
    if (held) manager?.abandonAudioFocusRequest(request)
    held = false
  }
}

/** The contact names to favor: trimmed, distinct, and capped like iOS. */
internal fun biasingStrings(names: List<String>): List<String> =
  names.map(String::trim).filter(String::isNotEmpty).distinct().take(MAX_BIASING_STRINGS)

private const val MAX_BIASING_STRINGS = 100

/** Finalized segments plus the in-progress guess for the current one. */
internal class TranscriptAccumulator {
  private val segments = mutableListOf<String>()
  private var partial = ""

  val text: String
    get() = (segments + partial).filter(String::isNotEmpty).joinToString(" ")

  fun partial(text: String) {
    partial = text.trim()
  }

  fun commit(text: String) {
    text.trim().takeIf(String::isNotEmpty)?.let(segments::add)
    partial = ""
  }

  /** A session ended without finalizing its last words; keep the guess. */
  fun commitPartial() = commit(partial)
}

/** Spaces events at least `intervalMs` apart; the caller sends the latest value. */
internal class Throttle(private val intervalMs: Long) {
  private var lastAt: Long? = null

  /** Milliseconds to wait before the next send; 0 sends now. */
  fun delay(now: Long): Long = lastAt?.let { maxOf(0L, it + intervalMs - now) } ?: 0L

  fun sent(now: Long) {
    lastAt = now
  }
}
