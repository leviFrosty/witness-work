package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.WatchEntryDraft
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchRequest
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** The same month as `MonthProgress.swift` shows it; keep both in step. */
class MonthProgressTest {
  private val zone = ZoneId.of("America/Chicago")
  private val t: (String) -> String = { mapOf("hoursCompact" to "h", "minutesCompact" to "m")[it] ?: it }

  /** The phone's contract fixture: October 2026, 16.5h of a 50h goal, plans from the 6th. */
  private val snapshot: WatchSnapshot =
    PhoneContext.fromJson(JSONObject(javaClass.classLoader!!.getResource("phone-context.json")!!.readText())).snapshot!!

  private fun at(day: Int, hour: Int = 9, month: Int = 10) = ZonedDateTime.of(2026, month, day, hour, 0, 0, 0, zone)

  private fun entry(id: String, date: String, minutes: Int, categoryId: String? = null) =
    OutboxItem(
      WatchRequest(
        kind = WatchRequest.Kind.ADD_ENTRY,
        id = id,
        entry = WatchEntryDraft(id, date, minutes / 60, minutes % 60, categoryId, WatchOrigin.APP),
      ),
      createdAtMs = 0,
      delivered = false,
    )

  private fun progress(date: ZonedDateTime, outbox: List<OutboxItem> = emptyList(), resolved: List<String> = emptyList()) =
    MonthProgress.of(snapshot, outbox, resolved, date, t)!!

  @Test
  fun `formats durations like formatMinutesCompact`() {
    assertEquals(
      // As `formatMinutesCompact`: long totals keep their tenths.
      listOf("0h", "30m", "2h", "1.5h", "9.9h", "12h", "11.5h", "16.5h"),
      listOf(0, 30, 120, 90, 594, 720, 690, 990).map { MonthProgress.compact(it, t) },
    )
  }

  @Test
  fun `gives gauges the bare number`() {
    assertEquals(listOf("0", "0.5", "2", "11.5", "16.5"), listOf(0, 30, 120, 690, 990).map { MonthProgress.hoursNumber(it) })
  }

  @Test
  fun `shows the phone's figures while nothing is waiting`() {
    val p = progress(at(5))
    assertEquals("16.5h", p.total)
    assertEquals("16.5", p.hours)
    assertEquals(snapshot.monthFormatted, p.formatted)
    assertEquals(990.0 / 3000, p.fraction!!, 1e-9)
    assertEquals(50, p.goalHours)
  }

  @Test
  fun `adds Standard time the phone hasn't saved yet, but waits for Credit Time`() {
    val p =
      progress(
        at(5),
        listOf(entry("w1", "2026-10-05", 90), entry("w2", "2026-10-05", 60, categoryId = "ldc"), entry("w3", "2026-09-30", 60)),
      )
    assertEquals("18h", p.total)
    assertEquals(p.total, p.formatted)
    assertEquals("reportedToday", p.publisherState)
  }

  @Test
  fun `doesn't count an entry twice once the phone counts it`() {
    assertEquals("16.5h", progress(at(5), listOf(entry("w1", "2026-10-05", 90)), resolved = listOf("w1")).total)
  }

  @Test
  fun `paces against the plans through today, otherwise per remaining day`() {
    // No plans through the 5th: hours per day for the 26 whole days left.
    assertEquals("1.3h hoursPerDayToGoal", progress(at(5)).paceText)
    assertNull(progress(at(5)).paceFraction)
    // 120 planned minutes through the 6th, 990 done: ahead, with the mark at 120/3000.
    val sixth = progress(at(6))
    assertEquals("aheadOfSchedule", sixth.paceText)
    assertEquals(120.0 / 3000, sixth.paceFraction!!, 1e-9)
  }

  @Test
  fun `stops pacing once the goal is reached`() {
    val p = progress(at(5), listOf(entry("w1", "2026-10-05", 34 * 60)))
    assertTrue(p.goalReached)
    assertNull(p.paceText)
    assertEquals(1.0, p.fraction!!, 0.0)
  }

  @Test
  fun `starts next month at zero at midnight without the phone`() {
    val november = progress(at(1, hour = 0, month = 11))
    assertEquals("November", november.monthName)
    assertEquals("0h", november.total)
    assertEquals("unreported", november.publisherState)
    assertFalse(november.goalReached)
  }

  @Test
  fun `is out of date once both months have ended`() {
    assertNull(MonthProgress.of(snapshot, emptyList(), emptyList(), at(1, month = 12), t))
  }

  @Test
  fun `reported today becomes this month the next day`() {
    val reportedToday = snapshot.copy(publisherState = "reportedToday", generatedAt = at(5).toInstant().toEpochMilli().toDouble())
    assertEquals("reportedToday", reportedToday.publisherState(at(5, hour = 23)))
    assertEquals("reportedThisMonth", reportedToday.publisherState(at(6, hour = 0)))
  }
}
