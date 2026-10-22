package expo.modules.speechtranscription

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.LocaleList
import android.os.Looper
import android.speech.ModelDownloadListener
import android.speech.RecognitionSupport
import android.speech.RecognitionSupportCallback
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.annotation.RequiresApi
import java.util.Locale
import kotlin.coroutines.coroutineContext
import kotlin.coroutines.resume
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/** Whether the on-device model for a language is ready or still has to arrive. */
internal enum class ModelState { INSTALLED, PENDING, DOWNLOADABLE, UNKNOWN }

internal data class ResolvedLanguage(val locale: String, val model: ModelState)

/** The languages an on-device recognizer reports (Android 13+). */
internal data class OnDeviceLanguages(
  val installed: List<String>,
  val pending: List<String>,
  val supported: List<String>,
)

/**
 * Which language the on-device recognizer can serve, and fetching its model.
 * Only on-device languages count: a language the recognizer could serve only
 * online is unavailable, so voice logs fall back to the keyboard.
 */
internal object SpeechAvailability {
  const val ENGINE = "androidOnDevice"
  private const val SUPPORT_TIMEOUT_MS = 5_000L
  private const val DOWNLOAD_TIMEOUT_MS = 120_000L
  private const val DOWNLOAD_POLL_MS = 1_000L
  private const val RELEASE_DELAY_MS = 3_000L

  private sealed interface Support {
    data class Languages(val languages: OnDeviceLanguages) : Support

    /** The recognizer can't list its languages (Android 12, or it doesn't say). */
    data object Unknown : Support

    data object Failed : Support
  }

  private enum class Download { INSTALLED, FAILED, UNTRACKED }

  fun isRecognizerAvailable(context: Context): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

  /** Main thread. Null when this device has no on-device recognizer. */
  fun createRecognizer(context: Context): SpeechRecognizer? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    return runCatching { SpeechRecognizer.createOnDeviceSpeechRecognizer(context) }.getOrNull()
  }

  /**
   * Destroys a recognizer once nothing else is likely to need the service.
   * Destroying the app's last recognizer unbinds the system's connection to
   * the service, and a recognizer started while it unbinds fails, as happens
   * when `start` follows `getAvailability` or a recording right away.
   */
  fun releaseLater(recognizer: SpeechRecognizer) {
    Handler(Looper.getMainLooper()).postDelayed({ recognizer.destroy() }, RELEASE_DELAY_MS)
  }

  /**
   * Main thread. The first candidate (then the device's languages) that an
   * on-device model serves, installed or downloadable; null when none is.
   * Checks with `recognizer` when given, else with one of its own.
   */
  suspend fun resolve(
    context: Context,
    requested: List<String>,
    recognizer: SpeechRecognizer? = null,
  ): ResolvedLanguage? {
    if (!isRecognizerAvailable(context)) return null
    val candidates = LocaleMatcher.candidates(requested, deviceLocales())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val checker = recognizer ?: createRecognizer(context) ?: return null
      try {
        when (val support = querySupport(context, checker, supportIntent())) {
          is Support.Languages -> return LocaleMatcher.match(candidates, support.languages)
          Support.Failed -> return null
          Support.Unknown -> Unit
        }
      } finally {
        if (recognizer == null) releaseLater(checker)
      }
    }
    // Android 12 can't say which languages it has; it serves the device's.
    val default = Locale.getDefault().toLanguageTag()
    return LocaleMatcher.matchDefault(candidates, default)?.let {
      ResolvedLanguage(it, ModelState.UNKNOWN)
    }
  }

  /**
   * Main thread. Fetches the on-device model for `locale` and waits until it
   * is installed. Android 14+ reports progress; on Android 13 the model's
   * arrival is found by polling.
   */
  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  suspend fun install(
    context: Context,
    recognizer: SpeechRecognizer,
    intent: Intent,
    locale: String,
    onProgress: (Double?) -> Unit,
  ) {
    onProgress(null)
    val installed = withTimeoutOrNull(DOWNLOAD_TIMEOUT_MS) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        when (download(context, recognizer, intent, report = onProgress)) {
          Download.INSTALLED -> return@withTimeoutOrNull true
          Download.FAILED -> return@withTimeoutOrNull false
          Download.UNTRACKED -> recognizer.triggerModelDownload(intent)
        }
      } else {
        recognizer.triggerModelDownload(intent)
      }
      awaitInstalled(context, recognizer, intent, locale)
    }
    if (installed != true) throw SpeechErrors.modelUnavailable()
  }

  @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
  private suspend fun download(
    context: Context,
    recognizer: SpeechRecognizer,
    intent: Intent,
    report: (Double?) -> Unit,
  ): Download = suspendCancellableCoroutine { continuation ->
    recognizer.triggerModelDownload(
      intent,
      context.mainExecutor,
      object : ModelDownloadListener {
        override fun onProgress(completedPercent: Int) {
          if (continuation.isActive) report((completedPercent / 100.0).coerceIn(0.0, 1.0))
        }

        override fun onSuccess() {
          if (continuation.isActive) continuation.resume(Download.INSTALLED)
        }

        // Queued for later (for example, until Wi-Fi): too long to keep the user waiting.
        override fun onScheduled() {
          if (continuation.isActive) continuation.resume(Download.FAILED)
        }

        override fun onError(error: Int) {
          if (!continuation.isActive) return
          val untracked = error == SpeechRecognizer.ERROR_CANNOT_LISTEN_TO_DOWNLOAD_EVENTS
          continuation.resume(if (untracked) Download.UNTRACKED else Download.FAILED)
        }
      },
    )
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private suspend fun awaitInstalled(
    context: Context,
    recognizer: SpeechRecognizer,
    intent: Intent,
    locale: String,
  ): Boolean {
    while (coroutineContext.isActive) {
      val support = querySupport(context, recognizer, intent)
      if (support is Support.Languages && support.languages.installed.any { LocaleMatcher.same(it, locale) }) {
        return true
      }
      delay(DOWNLOAD_POLL_MS)
    }
    return false
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private suspend fun querySupport(
    context: Context,
    recognizer: SpeechRecognizer,
    intent: Intent,
  ): Support = withTimeoutOrNull(SUPPORT_TIMEOUT_MS) {
    suspendCancellableCoroutine<Support> { continuation ->
      recognizer.checkRecognitionSupport(
        intent,
        context.mainExecutor,
        object : RecognitionSupportCallback {
          override fun onSupportResult(recognitionSupport: RecognitionSupport) {
            if (continuation.isActive) {
              continuation.resume(Support.Languages(languages(recognitionSupport)))
            }
          }

          override fun onError(error: Int) {
            if (!continuation.isActive) return
            val unknown = error == SpeechRecognizer.ERROR_CANNOT_CHECK_SUPPORT
            continuation.resume(if (unknown) Support.Unknown else Support.Failed)
          }
        },
      )
    }
  } ?: Support.Failed

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  private fun languages(support: RecognitionSupport): OnDeviceLanguages =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      OnDeviceLanguages(
        support.installedOnDeviceLanguages,
        support.pendingOnDeviceLanguages,
        support.supportedOnDeviceLanguages,
      )
    } else {
      OnDeviceLanguages(
        android13List(support, "getInstalledLanguages"),
        android13List(support, "getPendingLanguages"),
        android13List(support, "getSupportedLanguages"),
      )
    }

  /** Android 13's names for the on-device lists, which newer SDKs no longer declare. */
  private fun android13List(support: RecognitionSupport, getter: String): List<String> =
    runCatching { support.javaClass.getMethod(getter).invoke(support) as? List<*> }
      .getOrNull()
      ?.filterIsInstance<String>()
      .orEmpty()

  private fun supportIntent() =
    Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)

  private fun deviceLocales(): List<String> {
    val locales = LocaleList.getDefault()
    return (0 until locales.size()).map { locales[it].toLanguageTag() }
  }
}

/** Matches BCP-47 candidates against the tags a recognizer reports. */
internal object LocaleMatcher {
  /** Requested languages first, then the device's; blanks and repeats dropped. */
  fun candidates(requested: List<String>, device: List<String>): List<String> {
    val seen = HashSet<String>()
    return (requested + device)
      .map { it.trim().replace('_', '-') }
      .filter { it.isNotEmpty() && seen.add(it.lowercase(Locale.ROOT)) }
  }

  /**
   * The first candidate an on-device model serves. For each candidate the
   * closest tag wins (region, then script), and an installed model beats one
   * that still has to download. A different script never matches.
   */
  fun match(candidates: List<String>, languages: OnDeviceLanguages): ResolvedLanguage? {
    val offered =
      listOf(
        ModelState.INSTALLED to languages.installed,
        ModelState.PENDING to languages.pending,
        ModelState.DOWNLOADABLE to languages.supported,
      ).flatMap { (state, tags) -> tags.mapNotNull { tag -> Tag.parse(tag)?.let { Offer(tag, it, state) } } }
    for (candidate in candidates) {
      val wanted = Tag.parse(candidate) ?: continue
      var best: Offer? = null
      var bestScore = -1
      for (offer in offered) {
        val closeness = wanted.closeness(offer.parsed) ?: continue
        // Closeness first; the list order (installed, pending, supported) breaks ties.
        val score = closeness * ModelState.entries.size + (ModelState.entries.size - offer.state.ordinal)
        if (score > bestScore) {
          best = offer
          bestScore = score
        }
      }
      best?.let { return ResolvedLanguage(it.tag, it.state) }
    }
    return null
  }

  /** Android 12: the device's default language, when a candidate speaks it. */
  fun matchDefault(candidates: List<String>, default: String): String? {
    val language = Tag.parse(default)?.language ?: return null
    return default.takeIf { candidates.any { Tag.parse(it)?.language == language } }
  }

  fun same(a: String, b: String): Boolean {
    val left = Tag.parse(a) ?: return false
    val right = Tag.parse(b) ?: return false
    return left == right
  }

  private class Offer(val tag: String, val parsed: Tag, val state: ModelState)

  private data class Tag(val language: String, val script: String, val region: String) {
    /** Null when `other` can't serve this language; higher is closer. */
    fun closeness(other: Tag): Int? {
      if (language != other.language) return null
      if (script.isNotEmpty() && other.script.isNotEmpty() && script != other.script) return null
      val sameRegion = region.isNotEmpty() && region == other.region
      return (if (sameRegion) 2 else 0) + (if (script == other.script) 1 else 0)
    }

    companion object {
      fun parse(tag: String): Tag? {
        val locale = Locale.forLanguageTag(tag.trim().replace('_', '-'))
        // Google's recognizers name Mandarin `cmn` (`cmn-Hans-CN`); the app says `zh`.
        val language = locale.language.lowercase(Locale.ROOT).let { if (it == "cmn") "zh" else it }
        if (language.isEmpty() || language == "und") return null
        val region = locale.country.uppercase(Locale.ROOT)
        val script = locale.script.ifEmpty { if (language == "zh") chineseScript(region) else "" }
        return Tag(language, script, region)
      }

      private fun chineseScript(region: String) = when (region) {
        "CN", "SG", "MY" -> "Hans"
        "TW", "HK", "MO" -> "Hant"
        else -> ""
      }
    }
  }
}
