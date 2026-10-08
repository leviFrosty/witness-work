package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.UpNextItem
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** What Up Next shows as time passes, as `UpNext.swift` decides it. */
class UpNextTest {
  private val zone = ZoneId.systemDefault()

  private fun at(day: Int, hour: Int, minute: Int = 0) = ZonedDateTime.of(2026, 10, day, hour, minute, 0, 0, zone)

  private fun item(id: String, start: ZonedDateTime, timed: Boolean = true, kind: UpNextItem.Kind = UpNextItem.Kind.FOLLOW_UP) =
    UpNextItem(
      id = id,
      kind = kind,
      start = start.toInstant().toEpochMilli().toDouble(),
      timed = timed,
      title = "Maria González",
      detail = "Why we suffer",
      durationText = if (kind == UpNextItem.Kind.PLAN) "2h" else null,
      timeText = if (timed) "3:00 PM" else null,
      clockText = if (timed) "3:00" else null,
      periodText = if (timed) "PM" else null,
      weekdayText = "Thu",
      dateText = "Oct 15",
      place = null,
    )

  private val base: WatchSnapshot =
    PhoneContext.fromJson(JSONObject(javaClass.classLoader!!.getResource("phone-context.json")!!.readText())).snapshot!!

  private fun snapshot(vararg items: UpNextItem) = base.copy(upNext = items.toList())

  @Test
  fun `keeps a started item for 15 minutes, then moves on`() {
    val snapshot = snapshot(item("a", at(5, 15)), item("b", at(5, 17)))
    assertEquals(listOf("a", "b"), UpNext.items(snapshot, at(5, 15, 14)).map { it.id })
    assertEquals(listOf("b"), UpNext.items(snapshot, at(5, 15, 15)).map { it.id })
  }

  @Test
  fun `keeps a plan without a time up all its day`() {
    val snapshot = snapshot(item("p", at(5, 0), timed = false, kind = UpNextItem.Kind.PLAN))
    assertEquals(1, UpNext.items(snapshot, at(5, 23, 59)).size)
    assertEquals(0, UpNext.items(snapshot, at(6, 0)).size)
  }

  @Test
  fun `labels the day the way the Apple Watch does`() {
    val snapshot = snapshot()
    val now = at(5, 9)
    assertEquals("3:00 PM", UpNext.whenText(item("a", at(5, 15)), now, snapshot))
    assertEquals("watchNow · 3:00 PM", UpNext.heading(item("a", at(5, 8, 55)), now, snapshot))
    assertEquals("tomorrow · 3:00 PM", UpNext.whenText(item("a", at(6, 15)), now, snapshot))
    assertEquals("Thu", UpNext.shortWhen(item("a", at(8, 15)), now, snapshot))
    assertEquals("Oct 15", UpNext.shortWhen(item("a", at(15, 15)), now, snapshot))
    assertEquals("today", UpNext.whenText(item("p", at(5, 0), timed = false), now, snapshot))
    assertEquals("3:00", UpNext.clock(item("a", at(5, 15)), now, snapshot))
    assertNull(UpNext.clock(item("a", at(6, 15)), now, snapshot))
  }

  @Test
  fun `hides a Contact's name and topic while names are hidden`() {
    val followUp = item("a", at(5, 15))
    assertEquals("followUp", UpNext.title(followUp, hidesNames = true, snapshot()))
    assertNull(UpNext.detail(followUp, hidesNames = true))
    val plan = item("p", at(5, 15), kind = UpNextItem.Kind.PLAN)
    assertEquals("Maria González", UpNext.title(plan, hidesNames = true, snapshot()))
    assertEquals("2h · Why we suffer", UpNext.detail(plan, hidesNames = true))
  }

  @Test
  fun `changes when an item nears, starts and leaves, and at each midnight`() {
    val snapshot = snapshot(item("a", at(5, 15)))
    val changes = UpNext.changes(snapshot, at(5, 9))
    assertEquals(listOf(at(5, 14), at(5, 15), at(5, 15, 15), at(6, 0)), changes.take(4))
    assertEquals(10, changes.size)
    assertTrue(changes.zipWithNext().all { (a, b) -> a < b })
  }
}
