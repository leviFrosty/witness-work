package expo.modules.buddieskeychain

import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Holds the Buddies root seed on Android: sealed by the Android Keystore on
 * this device and backed up through Block Store (see `RootSeedStore`). Same
 * interface as the iOS module, so the JS side is shared.
 */
class BuddiesKeychainModule : Module() {
  private val store by lazy {
    RootSeedStore(appContext.reactContext ?: throw Exceptions.ReactContextLost())
  }

  override fun definition() = ModuleDefinition {
    Name("BuddiesKeychain")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("buddiesKeychainVersion") {
      3
    }

    Function("peekRootSeed") { ->
      store.peek()?.let { base64url(it) }
    }

    Function("getOrCreateRootSeed") { ->
      base64url(store.getOrCreate())
    }

    Function("deleteRootSeed") { ->
      store.delete()
    }

    Function("rootSeedBackup") { ->
      store.backupState()
    }

    // The same, off the JS thread: a first read can wait on Block Store (Google
    // Play services) for up to 10 seconds. On the IO pool rather than the
    // shared modules queue, so a slow Block Store holds up no other module. JS
    // falls back to the functions above on binaries without these.
    AsyncFunction("peekRootSeedAsync") Coroutine { ->
      withContext(Dispatchers.IO) { store.peek()?.let { base64url(it) } }
    }

    AsyncFunction("getOrCreateRootSeedAsync") Coroutine { ->
      withContext(Dispatchers.IO) { base64url(store.getOrCreate()) }
    }

    AsyncFunction("deleteRootSeedAsync") Coroutine { ->
      withContext(Dispatchers.IO) { store.delete() }
    }

    // Version 3: the account key received from a recovery key or another
    // device replaces this one, here and in Block Store.
    AsyncFunction("replaceRootSeedAsync") Coroutine { seed: String ->
      val bytes =
        try {
          Base64.decode(seed, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        } catch (error: IllegalArgumentException) {
          throw RootSeedException("The root seed isn't base64url", error)
        }
      withContext(Dispatchers.IO) { store.replace(bytes) }
    }
  }

  private fun base64url(bytes: ByteArray): String =
    Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
