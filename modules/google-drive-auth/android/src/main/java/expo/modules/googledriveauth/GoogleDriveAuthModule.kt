package expo.modules.googledriveauth

import android.app.Activity
import android.content.Context
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Authorizes WitnessWork's Google Drive app data folder (witness-work ADR 0019)
 * with Google Identity Services' AuthorizationClient and hands JS a short-lived
 * OAuth access token. Drive itself is called from JS; this module never sees
 * sync data, and never learns which account the user picked.
 *
 * Only `drive.appdata` is requested: a non-sensitive scope that reaches this
 * app's hidden folder and nothing else in the user's Drive. Errors map to
 * stable, non-localized codes so JS never inspects message text.
 */
class GoogleDriveAuthModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** The interactive request waiting for Google's consent screen to return. */
  private var pendingConsent: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("GoogleDriveAuth")

    Function("isSupported") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) ==
        ConnectionResult.SUCCESS
    }

    /**
     * Resolves to an access token. Without `interactive`, rejects with
     * CONSENT_REQUIRED instead of showing UI, so background refreshes stay
     * silent. `selectAccount` always shows Google's account picker, which is
     * how the user switches accounts.
     */
    AsyncFunction("authorize") { interactive: Boolean, selectAccount: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (interactive && activity == null) {
        reject(promise, UNAVAILABLE)
        return@AsyncFunction
      }
      val request = AuthorizationRequest.builder()
        .setRequestedScopes(listOf(Scope(DRIVE_APPDATA_SCOPE)))
        .apply { if (selectAccount) setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT) }
        .build()
      client(activity)
        .authorize(request)
        .addOnSuccessListener { result ->
          if (!result.hasResolution()) {
            resolveToken(promise, result)
            return@addOnSuccessListener
          }
          val intent = result.pendingIntent
          if (!interactive || activity == null || intent == null) {
            reject(promise, CONSENT_REQUIRED)
            return@addOnSuccessListener
          }
          // A second interactive request while consent is showing replaces
          // the first, which reads as cancelled.
          pendingConsent?.let { reject(it, CANCELED) }
          pendingConsent = promise
          try {
            activity.startIntentSenderForResult(
              intent.intentSender, REQUEST_CODE, null, 0, 0, 0, null,
            )
          } catch (error: Exception) {
            pendingConsent = null
            reject(promise, UNAVAILABLE)
          }
        }
        .addOnFailureListener { error -> reject(promise, codeFor(error)) }
    }

    /** Drops a token Drive rejected so the next authorize mints a new one. */
    AsyncFunction("clearToken") { token: String, promise: Promise ->
      client(null)
        .clearToken(ClearTokenRequest.builder().setToken(token).build())
        .addOnSuccessListener { promise.resolve(null) }
        .addOnFailureListener { error -> reject(promise, codeFor(error)) }
    }

    OnActivityResult { activity, payload ->
      if (payload.requestCode != REQUEST_CODE) return@OnActivityResult
      val promise = pendingConsent ?: return@OnActivityResult
      pendingConsent = null
      if (payload.resultCode != Activity.RESULT_OK || payload.data == null) {
        reject(promise, CANCELED)
        return@OnActivityResult
      }
      try {
        resolveToken(promise, client(activity).getAuthorizationResultFromIntent(payload.data))
      } catch (error: ApiException) {
        reject(promise, codeFor(error))
      }
    }
  }

  private fun client(activity: Activity?): AuthorizationClient =
    if (activity != null) Identity.getAuthorizationClient(activity)
    else Identity.getAuthorizationClient(context)

  private fun resolveToken(promise: Promise, result: AuthorizationResult) {
    val token = result.accessToken
    if (token.isNullOrEmpty() || !result.grantedScopes.contains(DRIVE_APPDATA_SCOPE)) {
      // The user unticked the Drive permission on the consent screen.
      reject(promise, SCOPE_DENIED)
      return
    }
    promise.resolve(token)
  }

  private fun codeFor(error: Throwable): String =
    when ((error as? ApiException)?.statusCode) {
      CommonStatusCodes.CANCELED -> CANCELED
      CommonStatusCodes.NETWORK_ERROR, CommonStatusCodes.TIMEOUT -> NETWORK
      CommonStatusCodes.SIGN_IN_REQUIRED, CommonStatusCodes.RESOLUTION_REQUIRED -> CONSENT_REQUIRED
      // No Android OAuth client matches this package and signing certificate.
      CommonStatusCodes.DEVELOPER_ERROR -> MISCONFIGURED
      CommonStatusCodes.API_NOT_CONNECTED -> UNAVAILABLE
      else -> UNKNOWN
    }

  /**
   * Sends the code as the rejection's `code` and inside its message, as Play
   * Integrity does, for runtimes that drop the code from async rejections.
   */
  private fun reject(promise: Promise, code: String) {
    promise.reject(code, "Google Drive authorization failed ($code)", null)
  }

  private companion object {
    const val DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
    const val REQUEST_CODE = 0x5764 // "Wd"
    const val CANCELED = "GOOGLE_DRIVE_AUTH_CANCELED"
    const val CONSENT_REQUIRED = "GOOGLE_DRIVE_AUTH_CONSENT_REQUIRED"
    const val SCOPE_DENIED = "GOOGLE_DRIVE_AUTH_SCOPE_DENIED"
    const val NETWORK = "GOOGLE_DRIVE_AUTH_NETWORK"
    const val MISCONFIGURED = "GOOGLE_DRIVE_AUTH_MISCONFIGURED"
    const val UNAVAILABLE = "GOOGLE_DRIVE_AUTH_UNAVAILABLE"
    const val UNKNOWN = "GOOGLE_DRIVE_AUTH_UNKNOWN"
  }
}
