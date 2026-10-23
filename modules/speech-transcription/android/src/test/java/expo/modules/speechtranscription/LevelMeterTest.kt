package expo.modules.speechtranscription

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LevelMeterTest {
  @Test
  fun `maps the recognizer's -2 to 10 range onto 0 to 1`() {
    assertEquals(0f, LevelMeter.level(-2f), 0.0001f)
    assertEquals(0.5f, LevelMeter.level(4f), 0.0001f)
    assertEquals(1f, LevelMeter.level(10f), 0.0001f)
  }

  @Test
  fun `clamps readings outside the range and treats NaN as silence`() {
    assertEquals(0f, LevelMeter.level(-40f), 0.0001f)
    assertEquals(1f, LevelMeter.level(25f), 0.0001f)
    assertEquals(0f, LevelMeter.level(Float.NaN), 0.0001f)
  }

  @Test
  fun `emits at most every 80 ms, averaging the readings in between`() {
    var now = 1_000L
    val meter = LevelMeter({ now })
    assertEquals(0.5f, meter.add(4f)!!, 0.0001f)
    now += 30
    assertNull(meter.add(10f))
    now += 30
    assertNull(meter.add(-2f))
    now += 20
    // 1.0, 0.0 and 0.5 since the last emit.
    assertEquals(0.5f, meter.add(4f)!!, 0.0001f)
    now += 79
    assertNull(meter.add(10f))
  }
}
