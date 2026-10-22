package expo.modules.fontweightadjustment

import android.content.res.Configuration
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads Android's Bold text setting (Android 12 and later). The system
 * emboldens the fonts it resolves itself, but React Native draws each of the
 * app's custom faces as its own family, so the app maps them heavier instead.
 */
class FontWeightAdjustmentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FontWeightAdjustment")

    // How many weight units the setting adds (300 with Bold text on), or 0.
    // Read from the activity, whose configuration is current once the user
    // changes the setting and comes back.
    Function("get") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@Function 0
      val configuration =
        (appContext.currentActivity ?: appContext.reactContext)?.resources?.configuration
          ?: return@Function 0
      val adjustment = configuration.fontWeightAdjustment
      if (adjustment == Configuration.FONT_WEIGHT_ADJUSTMENT_UNDEFINED) 0 else adjustment
    }
  }
}
