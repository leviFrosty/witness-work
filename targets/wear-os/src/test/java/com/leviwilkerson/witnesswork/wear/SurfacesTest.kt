package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class SurfacesTest {
  private val context =
    PhoneContext.fromJson(JSONObject(javaClass.classLoader!!.getResource("phone-context.json")!!.readText()))

  private fun running(running: Boolean, revision: Int) =
    context.copy(
      sentAt = context.sentAt + revision,
      timer = TimerSnapshot(isRunning = running, startedAt = if (running) 1.0 else null, accumulatedMs = 0.0, revision = revision),
    )

  @Test
  fun `refreshes everything when the snapshot changes`() {
    assertEquals(Surfaces.Refresh.ALL, Surfaces.refreshFor(null, context))
    assertEquals(Surfaces.Refresh.ALL, Surfaces.refreshFor(context, context.copy(snapshot = null)))
  }

  @Test
  fun `refreshes the tile when only the timer starts or pauses`() {
    // The tile's Start/Pause button used to keep the old state until midnight.
    assertEquals(Surfaces.Refresh.TILE, Surfaces.refreshFor(running(false, 1), running(true, 2)))
    assertEquals(Surfaces.Refresh.TILE, Surfaces.refreshFor(running(true, 2), running(false, 3)))
  }

  @Test
  fun `leaves them alone otherwise`() {
    assertEquals(Surfaces.Refresh.NONE, Surfaces.refreshFor(running(false, 1), running(false, 4)))
  }
}
