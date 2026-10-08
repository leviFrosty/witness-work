package expo.modules.stopwatchbridge

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.CopyOnWriteArraySet

/** Mirrors `StopwatchState` in `modules/stopwatch-bridge/types.ts`. Timestamps are Unix seconds. */
data class StopwatchState(
  val startedAt: Double?,
  val accumulatedMs: Double,
  val isRunning: Boolean,
  val updatedAt: Double,
) {
  fun toMap(): Map<String, Any?> =
    mapOf(
      "startedAt" to startedAt,
      "accumulatedMs" to accumulatedMs,
      "isRunning" to isRunning,
      "updatedAt" to updatedAt,
    )

  fun toJson(): JSONObject =
    JSONObject()
      .put("startedAt", startedAt ?: JSONObject.NULL)
      .put("accumulatedMs", accumulatedMs)
      .put("isRunning", isRunning)
      .put("updatedAt", updatedAt)

  companion object {
    val ZERO = StopwatchState(startedAt = null, accumulatedMs = 0.0, isRunning = false, updatedAt = 0.0)

    /** `null` for anything that isn't a whole, consistent state. */
    fun fromJson(json: JSONObject): StopwatchState? {
      val startedAt = if (json.isNull("startedAt")) null else json.optDouble("startedAt", Double.NaN)
      val accumulatedMs = json.optDouble("accumulatedMs", Double.NaN)
      val updatedAt = json.optDouble("updatedAt", Double.NaN)
      val isRunning = json.opt("isRunning") as? Boolean ?: return null
      val valid =
        (startedAt == null || (startedAt.isFinite() && startedAt >= 0)) &&
          (!isRunning || startedAt != null) &&
          accumulatedMs.isFinite() && accumulatedMs >= 0 &&
          updatedAt.isFinite() && updatedAt >= 0
      return if (valid) StopwatchState(startedAt, accumulatedMs, isRunning, updatedAt) else null
    }
  }
}

/**
 * The phone's service timer on Android, like `StopwatchStore.swift` on iOS: the persisted
 * timestamps are the clock, so nothing has to tick in the background. Native so the Wear OS
 * watch can start, pause and save the timer through `modules/watch-bridge` while the app's
 * JavaScript isn't running.
 */
object StopwatchStore {
  private const val PREFERENCES = "witnesswork.stopwatch"
  private const val STATE_KEY = "state.v1"
  private const val COMMAND_COUNTER_KEY = "commandCounter.v1"

  private val listeners = CopyOnWriteArraySet<(StopwatchState) -> Unit>()

  /** Called after every change, on the thread that made it. */
  fun addListener(listener: (StopwatchState) -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: (StopwatchState) -> Unit) {
    listeners.remove(listener)
  }

  private fun preferences(context: Context) =
    context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  @Synchronized
  fun load(context: Context): StopwatchState {
    val encoded = preferences(context).getString(STATE_KEY, null) ?: return StopwatchState.ZERO
    return try {
      StopwatchState.fromJson(JSONObject(encoded)) ?: StopwatchState.ZERO
    } catch (_: Exception) {
      StopwatchState.ZERO
    }
  }

  /** Advances on every change; the watch refuses to save time it didn't see. */
  @Synchronized
  fun commandCounter(context: Context): Int = preferences(context).getInt(COMMAND_COUNTER_KEY, 0)

  /** Whether a state was ever saved, for importing the one JS kept before this store. */
  @Synchronized
  fun hasState(context: Context): Boolean = preferences(context).contains(STATE_KEY)

  /**
   * Loads, changes and saves the state under one lock, then tells listeners. `change`
   * returns `null` to leave the state as it is.
   */
  private fun mutate(context: Context, change: (StopwatchState) -> StopwatchState?): StopwatchState {
    val (state, changed) =
      synchronized(this) {
        val current = load(context)
        val next = change(current) ?: return@synchronized current to false
        val preferences = preferences(context)
        preferences
          .edit()
          .putString(STATE_KEY, next.toJson().toString())
          .putInt(COMMAND_COUNTER_KEY, preferences.getInt(COMMAND_COUNTER_KEY, 0) + 1)
          .commit()
        next to true
      }
    if (changed) listeners.forEach { it(state) }
    return state
  }

  fun start(context: Context, nowMs: Long = System.currentTimeMillis()): StopwatchState =
    mutate(context) { current ->
      // Idempotent: starting while running is a no-op.
      if (current.isRunning) {
        null
      } else {
        StopwatchState(
          startedAt = nowMs / 1000.0,
          accumulatedMs = current.accumulatedMs,
          isRunning = true,
          updatedAt = nowMs / 1000.0,
        )
      }
    }

  fun pause(context: Context, nowMs: Long = System.currentTimeMillis()): StopwatchState =
    mutate(context) { current ->
      val startedAt = current.startedAt
      if (!current.isRunning || startedAt == null) {
        null
      } else {
        StopwatchState(
          startedAt = null,
          accumulatedMs = current.accumulatedMs + maxOf(0.0, nowMs - startedAt * 1000),
          isRunning = false,
          updatedAt = nowMs / 1000.0,
        )
      }
    }

  fun reset(context: Context, nowMs: Long = System.currentTimeMillis()): StopwatchState =
    mutate(context) { StopwatchState.ZERO.copy(updatedAt = nowMs / 1000.0) }

  /** Takes over the state JS stored itself before this store existed, once. */
  fun importLegacy(context: Context, state: StopwatchState): Boolean {
    var imported = false
    mutate(context) {
      if (hasState(context)) {
        null
      } else {
        imported = true
        state
      }
    }
    return imported
  }
}
