package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.UpNextItem
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/**
 * What Up Next shows at a given time: the soonest Follow-up or Plan that hasn't started, or one
 * that started within `NOW_WINDOW_MS` so its place and topic are there on arrival. A Plan
 * without a time spans its day, after that day's timed items. The phone sends the next two
 * weeks in order (`src/app/watch/buildUpNext.ts`); the watch only drops what has passed, so it
 * stays right without the phone. A port of `UpNext.swift`.
 */
object UpNext {
  /** Mirrors `NOW_WINDOW_MINUTES` in `buildUpNext.ts`. */
  const val NOW_WINDOW_MS = 15L * 60 * 1000

  /** How early the tile and complication treat an item as soon. */
  const val SOON_WINDOW_MS = 60L * 60 * 1000

  /** Items still to show at `date`, soonest first. */
  fun items(snapshot: WatchSnapshot?, date: ZonedDateTime): List<UpNextItem> =
    snapshot?.upNext.orEmpty().filter { shownUntil(it, date) > date.toInstant().toEpochMilli() }

  fun item(id: String, snapshot: WatchSnapshot?): UpNextItem? = snapshot?.upNext?.firstOrNull { it.id == id }

  /** Epoch ms when `item` stops showing. `zone` decides where its day ends. */
  fun shownUntil(item: UpNextItem, date: ZonedDateTime): Long {
    if (item.timed) return item.startMs + NOW_WINDOW_MS
    // The next day's start, not a day after this one's: where the clocks skip midnight, the day
    // starts at 1:00 and the next one at midnight.
    return MonthProgress.midnights(start(item, date), 1).first().toInstant().toEpochMilli()
  }

  fun isNow(item: UpNextItem, date: ZonedDateTime): Boolean = item.timed && item.startMs <= date.toInstant().toEpochMilli()

  /** Within the hour before a timed item, or during its Now window. */
  fun isSoon(item: UpNextItem, date: ZonedDateTime): Boolean =
    item.timed && item.startMs - date.toInstant().toEpochMilli() <= SOON_WINDOW_MS

  /**
   * Times after `date` when what Up Next shows changes: an item becoming soon, starting, or
   * leaving, and each midnight, when day labels change. Only those before `timelineEnd`.
   */
  fun changes(snapshot: WatchSnapshot?, date: ZonedDateTime): List<ZonedDateTime> {
    val times = mutableSetOf<Long>()
    for (item in snapshot?.upNext.orEmpty()) {
      if (!item.timed) continue
      times += item.startMs - SOON_WINDOW_MS
      times += item.startMs
      times += shownUntil(item, date)
    }
    times += MonthProgress.midnights(date, MonthProgress.TIMELINE_DAYS).map { it.toInstant().toEpochMilli() }
    val after = date.toInstant().toEpochMilli()
    val end = timelineEnd(date).toInstant().toEpochMilli()
    return times.filter { it > after && it < end }.sorted().map { ZonedDateTime.ofInstant(Instant.ofEpochMilli(it), date.zone) }
  }

  /**
   * Where a complication timeline made at `date` runs out: the eighth midnight, like Monthly
   * Progress's. Past it, a week on without an update, it shows "—" rather than what was coming
   * up a week ago.
   */
  fun timelineEnd(date: ZonedDateTime): ZonedDateTime = MonthProgress.midnights(date, MonthProgress.TIMELINE_DAYS + 1).last()

  /**
   * When `item` starts in `date`'s zone. An untimed Plan's day starts at midnight there, wherever
   * the phone was when it sent it.
   */
  private fun start(item: UpNextItem, date: ZonedDateTime): ZonedDateTime {
    val day = item.day?.takeIf { !item.timed }?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
    return day?.atStartOfDay(date.zone) ?: ZonedDateTime.ofInstant(Instant.ofEpochMilli(item.startMs), date.zone)
  }

  // MARK: Labels

  /** `null` today; otherwise `Tomorrow`, a weekday this week, or a date. */
  fun dayLabel(item: UpNextItem, date: ZonedDateTime, snapshot: WatchSnapshot?): String? {
    val days = ChronoUnit.DAYS.between(date.toLocalDate(), start(item, date).toLocalDate())
    return when {
      days <= 0 -> null
      days == 1L -> L10n.t("tomorrow", snapshot)
      days <= 6 -> item.weekdayText
      else -> item.dateText
    }
  }

  /** E.g. `3:00 PM`, `Tomorrow · 3:00 PM`, `Today` or `Thu`. */
  fun whenText(item: UpNextItem, date: ZonedDateTime, snapshot: WatchSnapshot?): String {
    val day = dayLabel(item, date, snapshot)
    val time = item.timeText
    return when {
      day != null && time != null -> "$day · $time"
      day != null -> day
      time != null -> time
      else -> L10n.t("today", snapshot)
    }
  }

  /** `Now · 3:00 PM` once it has started, otherwise `whenText`. */
  fun heading(item: UpNextItem, date: ZonedDateTime, snapshot: WatchSnapshot?): String {
    val text = whenText(item, date, snapshot)
    return if (isNow(item, date)) "${L10n.t("watchNow", snapshot)} · $text" else text
  }

  /** The time today, otherwise the day; for tight spots. */
  fun shortWhen(item: UpNextItem, date: ZonedDateTime, snapshot: WatchSnapshot?): String {
    if (isNow(item, date)) return L10n.t("watchNow", snapshot)
    return dayLabel(item, date, snapshot) ?: item.timeText ?: L10n.t("today", snapshot)
  }

  /** The time without its AM/PM marker, for a timed item later today. */
  fun clock(item: UpNextItem, date: ZonedDateTime, snapshot: WatchSnapshot?): String? {
    if (isNow(item, date) || dayLabel(item, date, snapshot) != null) return null
    return item.clockText
  }

  /**
   * The title, except a Contact's name while `hidesNames`: a dimmed watch, or a watch face, is
   * visible to the person you're talking with.
   */
  fun title(item: UpNextItem, hidesNames: Boolean, snapshot: WatchSnapshot?): String =
    if (item.kind == UpNextItem.Kind.FOLLOW_UP && hidesNames) L10n.t("followUp", snapshot) else item.title

  /** Topic or street for a Follow-up (hidden with names); duration and place for a Plan. */
  fun detail(item: UpNextItem, hidesNames: Boolean): String? =
    when (item.kind) {
      UpNextItem.Kind.FOLLOW_UP -> if (hidesNames) null else item.detail
      UpNextItem.Kind.PLAN ->
        listOfNotNull(item.durationText, item.detail).filter { it.isNotEmpty() }.joinToString(" · ").ifEmpty { null }
    }

  fun icon(item: UpNextItem): Int = if (item.kind == UpNextItem.Kind.FOLLOW_UP) R.drawable.ic_person else R.drawable.ic_calendar
}
