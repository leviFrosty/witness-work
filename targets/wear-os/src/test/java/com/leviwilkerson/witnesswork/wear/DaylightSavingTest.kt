package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.UpNextItem
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Wear OS's day math on a daylight saving day (23 h and 25 h days), as `watch-dst.swift` checks
 * the Apple Watch's. Cuba and Chile change their clocks at midnight: a day that skips it starts
 * at 1:00.
 */
class DaylightSavingTest {
  private data class Transition(val zone: ZoneId, val day: LocalDate, val hours: Long)

  private val transitions =
    listOf(
      Transition(ZoneId.of("America/New_York"), LocalDate.of(2026, 11, 1), 25),
      Transition(ZoneId.of("America/New_York"), LocalDate.of(2026, 3, 8), 23),
      Transition(ZoneId.of("Europe/London"), LocalDate.of(2026, 10, 25), 25),
      Transition(ZoneId.of("Australia/Sydney"), LocalDate.of(2026, 10, 4), 23),
      Transition(ZoneId.of("America/Havana"), LocalDate.of(2026, 3, 8), 23),
      Transition(ZoneId.of("America/Havana"), LocalDate.of(2026, 11, 1), 25),
      Transition(ZoneId.of("America/Santiago"), LocalDate.of(2026, 9, 6), 23),
      Transition(ZoneId.of("Asia/Tokyo"), LocalDate.of(2026, 11, 1), 24),
    )

  private val base: WatchSnapshot =
    PhoneContext.fromJson(JSONObject(javaClass.classLoader!!.getResource("phone-context.json")!!.readText())).snapshot!!

  private fun Transition.at(offset: Long, hour: Int, minute: Int = 0): ZonedDateTime =
    day.plusDays(offset).atTime(hour, minute).atZone(zone)

  private fun Transition.label() = "$zone $day"

  private fun item(id: String, start: ZonedDateTime, timed: Boolean = true, day: String? = null) =
    UpNextItem(
      id = id,
      kind = UpNextItem.Kind.PLAN,
      start = start.toInstant().toEpochMilli().toDouble(),
      timed = timed,
      title = "Cart witnessing",
      detail = null,
      durationText = "2h",
      timeText = if (timed) "10:00 AM" else null,
      clockText = if (timed) "10:00" else null,
      periodText = if (timed) "AM" else null,
      weekdayText = "Sun",
      dateText = "Nov 1",
      place = null,
      day = day,
    )

  @Test
  fun `the days are the lengths these tests expect`() {
    for (t in transitions) {
      assertEquals(t.label(), Duration.ofHours(t.hours), Duration.between(t.at(0, 0), t.at(1, 0)))
    }
  }

  @Test
  fun `complications and the tile move on at each midnight`() {
    for (t in transitions) {
      val week = MonthProgress.midnights(t.at(-1, 12), 8)
      assertEquals(t.label(), (0L until 8L).map { t.at(it, 0) }, week)
      assertEquals(t.label(), t.at(7, 0), UpNext.timelineEnd(t.at(-1, 12)))
      // The tile's freshness interval runs out as the next day starts.
      for (now in listOf(t.at(-1, 22), t.at(0, 0, 30), t.at(0, 23, 30))) {
        val next = if (now.toLocalDate() == t.day) t.at(1, 0) else t.at(0, 0)
        assertEquals("${t.label()} from $now", next, MonthProgress.midnights(now, 1).first())
      }
    }
  }

  @Test
  fun `Up Next keeps Plans on their wall-clock day`() {
    for (t in transitions) {
      val timed = item("timed", t.at(0, 10))
      val untimed = item("untimed", t.at(0, 0), timed = false, day = t.day.toString())
      val tomorrow = item("tomorrow", t.at(1, 10))
      val snapshot = base.copy(upNext = listOf(timed, untimed, tomorrow))
      val label = t.label()
      assertEquals(label, t.at(1, 0).toInstant().toEpochMilli(), UpNext.shownUntil(untimed, t.at(0, 12)))
      assertEquals(label, listOf("untimed", "tomorrow"), UpNext.items(snapshot, t.at(0, 23, 30)).map { it.id })
      assertEquals(label, listOf("tomorrow"), UpNext.items(snapshot, t.at(1, 0)).map { it.id })
      assertEquals(label, "tomorrow", UpNext.dayLabel(timed, t.at(-1, 0, 30), snapshot))
      assertEquals(label, "tomorrow", UpNext.dayLabel(timed, t.at(-1, 23, 30), snapshot))
      assertNull(label, UpNext.dayLabel(timed, t.at(0, 0, 30), snapshot))
      assertNull(label, UpNext.dayLabel(untimed, t.at(0, 23, 30), snapshot))
      assertEquals(label, "tomorrow", UpNext.dayLabel(tomorrow, t.at(0, 0, 30), snapshot))
      assertEquals(label, "tomorrow", UpNext.dayLabel(tomorrow, t.at(0, 23, 30), snapshot))
      assertTrue(label, !UpNext.isSoon(timed, t.at(0, 8, 59)) && UpNext.isSoon(timed, t.at(0, 9)))
      val changes = UpNext.changes(snapshot, t.at(-1, 12))
      val expected = listOf(t.at(0, 0), t.at(0, 9), t.at(0, 10), t.at(0, 10, 15), t.at(1, 0), t.at(1, 9))
      assertTrue("$label: $changes", changes.containsAll(expected))
    }
  }

  @Test
  fun `month progress keeps its day all day`() {
    for (t in transitions) {
      val snapshot =
        base.copy(
          monthKey = t.day.toString().take(7),
          plannedThroughDay = null,
          publisherState = "reportedToday",
          generatedAt = t.at(0, 0, 30).toInstant().toEpochMilli().toDouble(),
        )
      val label = t.label()
      assertEquals(label, t.day.toString(), dayKey(t.at(0, 0)))
      assertEquals(label, t.day.toString(), dayKey(t.at(0, 23, 59)))
      assertNotEquals(label, t.day.toString(), dayKey(t.at(1, 0)))
      fun pace(date: ZonedDateTime) = MonthProgress.of(snapshot, emptyList(), emptyList(), date) { it }!!.paceText
      assertEquals(label, pace(t.at(0, 0)), pace(t.at(0, 23, 30)))
      assertEquals(label, "reportedToday", snapshot.publisherState(t.at(0, 23, 59)))
      assertEquals(label, "reportedThisMonth", snapshot.publisherState(t.at(1, 0)))
    }
  }

  @Test
  fun `the timer counts real time across the clock change`() {
    for (t in transitions) {
      val start = t.at(0, 0, 30).toInstant()
      val timer = TimerSnapshot(isRunning = true, startedAt = start.epochSecond.toDouble(), accumulatedMs = 0.0, revision = 1)
      val now = t.at(0, 4, 30).toInstant().toEpochMilli()
      assertEquals(t.label(), 4 + t.hours - 24, (timer.elapsedMs(now) / 3_600_000).toLong())
      assertEquals(t.label(), start.toEpochMilli(), timer.effectiveStartMs(now))
    }
  }
}
