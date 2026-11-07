package expo.modules.passkeys

import android.app.Activity
import android.content.Context
import android.os.Build
import android.os.CancellationSignal
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.exceptions.domerrors.AbortError
import androidx.credentials.exceptions.domerrors.ConstraintError
import androidx.credentials.exceptions.domerrors.DomError
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.domerrors.NotAllowedError
import androidx.credentials.exceptions.domerrors.NotSupportedError
import androidx.credentials.exceptions.domerrors.SecurityError
import androidx.credentials.exceptions.domerrors.TimeoutError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import org.json.JSONObject

/**
 * Passkeys for the server account (witness-work ADR 0038) through Credential
 * Manager: Google Password Manager or the User's own provider. Same interface
 * as the iOS module, so the JS side is shared.
 *
 * The WebAuthn JSON passes through untouched both ways, `prf` included; the
 * provider does the WebAuthn work. Android 13 and below may answer through a
 * legacy path that drops `prf`, which reads as a passkey without PRF.
 * Ceremonies run in the module's coroutine scope, so they end with it, one at
 * a time, and time out natively, as on iOS.
 */
class PasskeysModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val manager by lazy { CredentialManager.create(context.applicationContext) }

  private val ceremonyLock = Mutex()

  // The running ceremony's view of the app: `false` as the sheet covers it,
  // `true` as it comes back to the front.
  @Volatile private var lifecycle: Channel<Boolean>? = null

  override fun definition() = ModuleDefinition {
    Name("Passkeys")

    OnActivityEntersBackground { lifecycle?.trySend(false) }

    OnActivityEntersForeground { lifecycle?.trySend(true) }

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("passkeysVersion") {
      1
    }

    // Only a ceremony shows whether the provider evaluates PRF.
    AsyncFunction("getSupport") {
      mapOf("passkeys" to passkeysSupported(), "prf" to "unknown")
    }

    AsyncFunction("create") Coroutine { optionsJson: String ->
      val response = try {
        ceremony<CreateCredentialResponse, CreateCredentialException>(optionsJson) { activity, signal, callback ->
          manager.createCredentialAsync(
            activity,
            CreatePublicKeyCredentialRequest(optionsJson),
            signal,
            Runnable::run,
            callback,
          )
        }
      } catch (error: CreateCredentialException) {
        throw PasskeyException(codeFor(error), "${error.type}: ${error.errorMessage}")
      }
      (response as? CreatePublicKeyCredentialResponse)?.registrationResponseJson
        ?: throw PasskeyException(FAILED, "Unexpected response ${response.type}")
    }

    AsyncFunction("get") Coroutine { optionsJson: String ->
      val response = try {
        ceremony<GetCredentialResponse, GetCredentialException>(optionsJson) { activity, signal, callback ->
          manager.getCredentialAsync(
            activity,
            GetCredentialRequest(listOf(GetPublicKeyCredentialOption(optionsJson))),
            signal,
            Runnable::run,
            callback,
          )
        }
      } catch (error: GetCredentialException) {
        throw PasskeyException(codeFor(error), "${error.type}: ${error.errorMessage}")
      }
      (response.credential as? PublicKeyCredential)?.authenticationResponseJson
        ?: throw PasskeyException(FAILED, "Unexpected credential ${response.credential.type}")
    }
  }

  private fun requireActivity(): Activity =
    appContext.currentActivity ?: throw PasskeyException(FAILED, "No activity")

  /**
   * Runs one ceremony on the main thread; a second one while it's up fails at
   * once, as on iOS. Back and a tap outside the sheet answer `cancelled`, but
   * the sheet lives in the app's task, so anything that brings the
   * single-task `MainActivity` back to the front (the launcher icon, a
   * notification, a link) clears it, and Credential Manager then never
   * answers. So when the app is back in front and no answer follows, the
   * ceremony ends as `cancelled`; past the options' own timeout, as `timeout`.
   */
  private suspend fun <R, E : Exception> ceremony(
    optionsJson: String,
    start: (Activity, CancellationSignal, CredentialManagerCallback<R, E>) -> Unit,
  ): R {
    if (!ceremonyLock.tryLock()) throw PasskeyException(FAILED, "A passkey request is already running")
    val events = Channel<Boolean>(Channel.UNLIMITED)
    try {
      val activity = requireActivity()
      val requested = runCatching { JSONObject(optionsJson).optLong("timeout", 0L) }.getOrDefault(0L)
      val limit = (if (requested > 0) requested else DEFAULT_TIMEOUT_MS) + TIMEOUT_GRACE_MS
      lifecycle = events
      return try {
        withTimeout(limit) {
          withContext(Dispatchers.Main) {
            var sheetLost = false
            coroutineScope {
              val answer = async {
                suspendCancellableCoroutine<R> { continuation ->
                  val signal = CancellationSignal()
                  // Cancelling a request whose sheet is gone makes the system
                  // start an invisible chooser that takes every tap for
                  // seconds, so a lost sheet's request is only dropped.
                  continuation.invokeOnCancellation { if (!sheetLost) signal.cancel() }
                  start(activity, signal, object : CredentialManagerCallback<R, E> {
                    override fun onResult(result: R) {
                      if (continuation.isActive) continuation.resume(result)
                    }

                    override fun onError(e: E) {
                      if (continuation.isActive) continuation.resumeWithException(e)
                    }
                  })
                }
              }
              val sheetGone = launch { awaitSheetGone(events) }
              // Whichever ends first; leaving the scope cancels the other.
              select {
                answer.onAwait { result ->
                  sheetGone.cancel()
                  result
                }
                sheetGone.onJoin {
                  sheetLost = true
                  throw PasskeyException(CANCELLED, "The sheet closed without an answer")
                }
              }
            }
          }
        }
      } catch (error: TimeoutCancellationException) {
        throw PasskeyException(TIMEOUT, "No answer after ${limit / 1000} s")
      }
    } finally {
      lifecycle = null
      events.close()
      ceremonyLock.unlock()
    }
  }

  /**
   * Returns once the sheet has covered the app and the app has then stayed in
   * front for [SHEET_GONE_GRACE_MS]. A real answer lands within that grace of
   * the app resuming; past it, Credential Manager has dropped the request.
   */
  private suspend fun awaitSheetGone(events: ReceiveChannel<Boolean>) {
    while (events.receive()) {}
    while (true) {
      while (!events.receive()) {}
      withTimeoutOrNull(SHEET_GONE_GRACE_MS) { while (events.receive()) {} } ?: return
    }
  }

  /**
   * Android 9 is Credential Manager's floor for passkeys. Before 14 the only
   * provider is Google Play services.
   */
  private fun passkeysSupported(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    return GoogleApiAvailability.getInstance()
      .isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
  }

  private fun codeFor(error: CreateCredentialException): String =
    when (error) {
      is CreateCredentialCancellationException -> CANCELLED
      is CreateCredentialNoCreateOptionException,
      is CreateCredentialProviderConfigurationException,
      is CreateCredentialUnsupportedException -> NOT_SUPPORTED
      is CreatePublicKeyCredentialDomException -> codeFor(error.domError)
      else -> FAILED
    }

  private fun codeFor(error: GetCredentialException): String =
    when (error) {
      is GetCredentialCancellationException -> CANCELLED
      is NoCredentialException -> NO_CREDENTIALS
      is GetCredentialProviderConfigurationException,
      is GetCredentialUnsupportedException -> NOT_SUPPORTED
      is GetPublicKeyCredentialDomException -> codeFor(error.domError)
      else -> FAILED
    }

  /**
   * WebAuthn's DOM errors. `SecurityError` is the RP ID failing the asset
   * links check; `NotAllowedError` is WebAuthn's cancel; `InvalidStateError`
   * is a passkey in `excludeCredentials` already with the provider.
   */
  private fun codeFor(error: DomError): String =
    when (error) {
      is SecurityError -> DOMAIN_NOT_ASSOCIATED
      is InvalidStateError -> ALREADY_REGISTERED
      is NotAllowedError, is AbortError -> CANCELLED
      is TimeoutError -> TIMEOUT
      is NotSupportedError, is ConstraintError -> NOT_SUPPORTED
      else -> FAILED
    }

  private companion object {
    const val DEFAULT_TIMEOUT_MS = 300_000L
    // Lets the provider's own timeout answer first when it's still listening.
    const val TIMEOUT_GRACE_MS = 5_000L
    // How long an answer may trail the app coming back to the front.
    const val SHEET_GONE_GRACE_MS = 2_500L
    const val CANCELLED = "PASSKEY_CANCELLED"
    const val NOT_SUPPORTED = "PASSKEY_NOT_SUPPORTED"
    const val NO_CREDENTIALS = "PASSKEY_NO_CREDENTIALS"
    const val TIMEOUT = "PASSKEY_TIMEOUT"
    const val DOMAIN_NOT_ASSOCIATED = "PASSKEY_DOMAIN_NOT_ASSOCIATED"
    const val ALREADY_REGISTERED = "PASSKEY_ALREADY_REGISTERED"
    const val FAILED = "PASSKEY_FAILED"
  }
}

/**
 * Carries the code twice, as App Attest does: as the rejection's `code` and
 * inside its message, so the JS classifier still works on runtimes that drop
 * the code from async rejections.
 */
internal class PasskeyException(code: String, message: String) :
  CodedException(code, "Passkey operation failed ($code): $message", null)
