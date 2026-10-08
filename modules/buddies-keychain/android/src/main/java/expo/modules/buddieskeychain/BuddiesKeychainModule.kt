package expo.modules.buddieskeychain

import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
      1
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
  }

  private fun base64url(bytes: ByteArray): String =
    Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
