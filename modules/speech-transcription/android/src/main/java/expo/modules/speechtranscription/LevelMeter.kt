package expo.modules.speechtranscription

/**
 * Turns `RecognitionListener.onRmsChanged` into the 0...1 input level JS
 * draws, at iOS's cadence. The recognizer reports roughly -2 (room tone) to
 * 10 (loud speech) on its own scale rather than dBFS, so that span maps to
 * 0...1, where iOS maps -50...0 dBFS. Readings arrive every few milliseconds;
 * each emitted level averages the readings since the last one.
 */
internal class LevelMeter(private val now: () -> Long, private val intervalMs: Long = INTERVAL_MS) {
  private var lastAt: Long? = null
  private var sum = 0f
  private var count = 0

  /** The level to emit now, or null while inside the throttle window. */
  fun add(rmsdB: Float): Float? {
    sum += level(rmsdB)
    count++
    val time = now()
    val last = lastAt
    if (last != null && time - last < intervalMs) return null
    val mean = sum / count
    lastAt = time
    sum = 0f
    count = 0
    return mean
  }

  companion object {
    /** iOS samples one ~85 ms buffer at a time and throttles to 80 ms. */
    const val INTERVAL_MS = 80L
    private const val FLOOR_DB = -2f
    private const val SPAN_DB = 12f

    fun level(rmsdB: Float): Float =
      if (rmsdB.isNaN()) 0f else ((rmsdB - FLOOR_DB) / SPAN_DB).coerceIn(0f, 1f)
  }
}
