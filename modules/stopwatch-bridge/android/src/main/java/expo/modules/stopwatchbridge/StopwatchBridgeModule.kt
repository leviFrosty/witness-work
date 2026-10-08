package expo.modules.stopwatchbridge

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * Bridges `StopwatchStore` to JS on Android. Commands from the Wear OS watch change the state
 * in this process too, so every change is broadcast on `onStateChange`. Android has no Live
 * Activities.
 */
class StopwatchBridgeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val listener: (StopwatchState) -> Unit = { state ->
    sendEvent("onStateChange", state.toMap())
  }

  override fun definition() = ModuleDefinition {
    Name("StopwatchBridge")

    Events("onStateChange")

    OnCreate { StopwatchStore.addListener(listener) }

    OnDestroy { StopwatchStore.removeListener(listener) }

    Function("getState") { StopwatchStore.load(context).toMap() }

    Function("areLiveActivitiesEnabled") { false }

    AsyncFunction("start") { StopwatchStore.start(context).toMap() }

    AsyncFunction("resume") { StopwatchStore.start(context).toMap() }

    AsyncFunction("pause") { StopwatchStore.pause(context).toMap() }

    // Stop = pause; the app saves and resets separately.
    AsyncFunction("stop") { StopwatchStore.pause(context).toMap() }

    AsyncFunction("reset") { StopwatchStore.reset(context).toMap() }

    /** Takes over the timer JS kept in MMKV before this store existed. */
    Function("importLegacyState") { json: String ->
      val state =
        try {
          StopwatchState.fromJson(JSONObject(json))
        } catch (_: Exception) {
          null
        } ?: return@Function false
      StopwatchStore.importLegacy(context, state)
    }
  }
}
