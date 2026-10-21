package expo.modules.appswitcherprivacy

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Keeps the app's screen out of Recents while App Lock is on. Android takes the
 * Recents thumbnail as the app leaves, before React Native can draw its lock
 * screen, so the activity is told not to offer one. Screenshots still work.
 * Android 13 and later; older versions keep the thumbnail.
 */
class AppSwitcherPrivacyModule : Module() {
  private var hidden = false

  override fun definition() = ModuleDefinition {
    Name("AppSwitcherPrivacy")

    Constant("appSwitcherPrivacyVersion") {
      1
    }

    Function("setHidden") { hidden: Boolean ->
      this@AppSwitcherPrivacyModule.hidden = hidden
      apply()
    }

    // A recreated activity (a configuration change) starts with thumbnails on.
    OnActivityEntersForeground {
      apply()
    }
  }

  private fun apply() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val activity = appContext.currentActivity ?: return
    val enabled = !hidden
    activity.runOnUiThread { activity.setRecentsScreenshotEnabled(enabled) }
  }
}
