package expo.modules.speechtranscription

import org.junit.Assert.assertEquals
import org.junit.Test

class TranscriptTest {
  @Test
  fun `joins finalized segments and the current guess with spaces`() {
    val transcript = TranscriptAccumulator()
    transcript.partial("I did two")
    assertEquals("I did two", transcript.text)
    transcript.commit(" I did two hours this morning. ")
    transcript.partial("talked to")
    assertEquals("I did two hours this morning. talked to", transcript.text)
    transcript.commit("Talked to John at 42 Oak St.")
    assertEquals("I did two hours this morning. Talked to John at 42 Oak St.", transcript.text)
  }

  @Test
  fun `a session that ends without a final keeps its guess`() {
    val transcript = TranscriptAccumulator()
    transcript.commit("Hope for the future.")
    transcript.partial("follow up Tuesday")
    transcript.commitPartial()
    transcript.commitPartial()
    assertEquals("Hope for the future. follow up Tuesday", transcript.text)
  }

  @Test
  fun `blank results add nothing`() {
    val transcript = TranscriptAccumulator()
    transcript.commit("  ")
    transcript.partial("")
    transcript.commit("Hello")
    transcript.commit("")
    assertEquals("Hello", transcript.text)
  }

  @Test
  fun `throttles to the interval and sends the first event at once`() {
    val throttle = Throttle(250)
    assertEquals(0L, throttle.delay(1_000))
    throttle.sent(1_000)
    assertEquals(150L, throttle.delay(1_100))
    assertEquals(0L, throttle.delay(1_250))
    assertEquals(0L, throttle.delay(5_000))
  }

  @Test
  fun `biasing strings are trimmed, distinct and capped at 100`() {
    assertEquals(listOf("Ada Reyes", "John"), biasingStrings(listOf(" Ada Reyes ", "", "John", "Ada Reyes", "  ")))
    assertEquals(100, biasingStrings((1..150).map { "Name $it" }).size)
  }
}
