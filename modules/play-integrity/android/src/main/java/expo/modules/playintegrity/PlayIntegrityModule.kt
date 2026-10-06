package expo.modules.playintegrity

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityException
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Wraps Play Integrity standard requests — the Android security boundary for
 * Notes Import (witness-work ADR 0017), where iOS uses App Attest.
 *
 * The JS side computes the request hash. This adapter keeps one warmed-up token
 * provider per Cloud project, re-prepares it once when Play reports it invalid,
 * and maps Play's error codes to stable, non-localized tokens so lifecycle
 * decisions never inspect message text.
 */
class PlayIntegrityModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val lock = Any()
  private var provider: StandardIntegrityTokenProvider? = null
  private var providerProject: Long? = null
  private val pending = mutableMapOf<Long, MutableList<(Result<StandardIntegrityTokenProvider>) -> Unit>>()

  override fun definition() = ModuleDefinition {
    Name("PlayIntegrity")

    Function("isSupported") { true }

    AsyncFunction("prepare") { cloudProjectNumber: String, promise: Promise ->
      val project = parseProject(cloudProjectNumber)
      if (project == null) {
        reject(promise, INVALID_ARGUMENT)
        return@AsyncFunction
      }
      withProvider(project, refresh = false) { result ->
        result.fold(
          onSuccess = { promise.resolve(null) },
          onFailure = { reject(promise, codeFor(it)) },
        )
      }
    }

    AsyncFunction("requestToken") { cloudProjectNumber: String, requestHash: String, promise: Promise ->
      val project = parseProject(cloudProjectNumber)
      if (project == null || requestHash.isEmpty() || requestHash.length > MAX_REQUEST_HASH_LENGTH) {
        reject(promise, INVALID_ARGUMENT)
        return@AsyncFunction
      }
      request(project, requestHash, promise, retriesLeft = 1)
    }
  }

  private fun request(project: Long, requestHash: String, promise: Promise, retriesLeft: Int) {
    withProvider(project, refresh = retriesLeft == 0) { result ->
      val tokenProvider = result.getOrElse {
        reject(promise, codeFor(it))
        return@withProvider
      }
      tokenProvider
        .request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build())
        .addOnSuccessListener { response -> promise.resolve(response.token()) }
        .addOnFailureListener { error ->
          // A provider used for too long expires; Play's remedy is a new one.
          if (codeFor(error) == PROVIDER_INVALID && retriesLeft > 0) {
            request(project, requestHash, promise, retriesLeft - 1)
          } else {
            reject(promise, codeFor(error))
          }
        }
    }
  }

  /**
   * Hands every caller the same provider; concurrent first calls share one
   * warm-up (Play caps warm-ups at five per minute per app instance).
   */
  private fun withProvider(
    project: Long,
    refresh: Boolean,
    callback: (Result<StandardIntegrityTokenProvider>) -> Unit,
  ) {
    synchronized(lock) {
      if (refresh && providerProject == project) {
        provider = null
        providerProject = null
      }
      val ready = provider
      if (ready != null && providerProject == project) {
        callback(Result.success(ready))
        return
      }
      val waiting = pending[project]
      if (waiting != null) {
        waiting.add(callback)
        return
      }
      pending[project] = mutableListOf(callback)
    }

    IntegrityManagerFactory.createStandard(context.applicationContext)
      .prepareIntegrityToken(
        PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(project).build(),
      )
      .addOnSuccessListener { prepared -> settle(project, Result.success(prepared)) }
      .addOnFailureListener { error -> settle(project, Result.failure(error)) }
  }

  private fun settle(project: Long, result: Result<StandardIntegrityTokenProvider>) {
    val callbacks = synchronized(lock) {
      result.getOrNull()?.let {
        provider = it
        providerProject = project
      }
      pending.remove(project).orEmpty()
    }
    callbacks.forEach { it(result) }
  }

  private fun parseProject(value: String): Long? =
    value.takeIf { it.isNotEmpty() && it.all(Char::isDigit) }?.toLongOrNull()

  private fun codeFor(error: Throwable): String {
    val code = (error as? StandardIntegrityException)?.errorCode ?: return UNKNOWN
    // Values from Play's StandardIntegrityErrorCode, matched numerically so a
    // renamed constant in a future library can't silently change the mapping.
    return when (code) {
      -1 -> "PLAY_INTEGRITY_API_NOT_AVAILABLE"
      -2 -> "PLAY_INTEGRITY_PLAY_STORE_NOT_FOUND"
      -3 -> "PLAY_INTEGRITY_NETWORK_ERROR"
      -5 -> "PLAY_INTEGRITY_APP_NOT_INSTALLED"
      -6 -> "PLAY_INTEGRITY_PLAY_SERVICES_NOT_FOUND"
      -7 -> "PLAY_INTEGRITY_APP_UID_MISMATCH"
      -8 -> "PLAY_INTEGRITY_TOO_MANY_REQUESTS"
      -9 -> "PLAY_INTEGRITY_CANNOT_BIND_TO_SERVICE"
      -12 -> "PLAY_INTEGRITY_GOOGLE_SERVER_UNAVAILABLE"
      -14 -> "PLAY_INTEGRITY_PLAY_STORE_VERSION_OUTDATED"
      -15 -> "PLAY_INTEGRITY_PLAY_SERVICES_VERSION_OUTDATED"
      -16 -> "PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER_IS_INVALID"
      -17 -> "PLAY_INTEGRITY_REQUEST_HASH_TOO_LONG"
      -18 -> "PLAY_INTEGRITY_CLIENT_TRANSIENT_ERROR"
      -19 -> PROVIDER_INVALID
      -100 -> "PLAY_INTEGRITY_INTERNAL_ERROR"
      else -> UNKNOWN
    }
  }

  /**
   * Sends the code twice, as App Attest does: as the rejection's `code` and
   * inside its message, so the JS classifier still works on runtimes that drop
   * the code from async rejections.
   */
  private fun reject(promise: Promise, code: String) {
    promise.reject(code, "Play Integrity operation failed ($code)", null)
  }

  private companion object {
    const val MAX_REQUEST_HASH_LENGTH = 500
    const val INVALID_ARGUMENT = "PLAY_INTEGRITY_INVALID_ARGUMENT"
    const val PROVIDER_INVALID = "PLAY_INTEGRITY_TOKEN_PROVIDER_INVALID"
    const val UNKNOWN = "PLAY_INTEGRITY_UNKNOWN"
  }
}
