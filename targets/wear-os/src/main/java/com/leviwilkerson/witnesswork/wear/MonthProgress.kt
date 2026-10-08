package com.leviwilkerson.witnesswork.wear

import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit
import kotlin.math.floor

/**
 * The month's progress as the watch shows it: the phone's snapshot plus time added on the
 * watch that the phone hasn't saved yet, so the total moves as soon as time is added. Rolls
 * over to next month at midnight without the phone. A port of `MonthProgress.swift`; keep them
 * in step (`docs/watch/features.json`).
 */
data class MonthProgress(
  /** E.g. `October`. */
  val monthName: String,
  val showsTimeEntry: Boolean,
  /** Compact total, e.g. `12.5h`. */
  val total: String,
  /** `total` without its unit, e.g. `12.5`, for the middle of a circular gauge. */
  val hours: String,
  /** The total in the user's Duration Format when the phone's figure is current; otherwise `total`. */
  val formatted: String,
  /** Whole hours the user set; 0 means no goal. */
  val goalHours: Int,
  /** 0...1 toward the goal; `null` without one. */
  val fraction: Double?,
  /** 0...1: where the user's Plans put them by today; `null` without Plans or once the goal is reached. */
  val paceFraction: Double?,
  /** Ahead/behind or per-day line; `null` when there's nothing to show or the goal is reached. */
  val paceText: String?,
  val goalReached: Boolean,
  /** `unreported`, `reportedToday` or `reportedThisMonth`. */
  val publisherState: String,
) {
  companion object {
    /** `null` when the snapshot describes neither the month of `date` nor the month before it. */
    fun of(
      snapshot: WatchSnapshot,
      outbox: List<OutboxItem>,
      resolvedEntryIds: List<String>,
      date: ZonedDateTime,
      t: (String) -> String = { L10n.t(it, snapshot) },
    ): MonthProgress? {
      val key = monthKey(date)
      val monthName: String
      val showsTimeEntry: Boolean
      val goalHours: Int
      val baseMinutes: Int?
      val planned: List<Int>?
      var state: String
      val next = snapshot.nextMonth
      if (snapshot.isCurrent(date)) {
        monthName = snapshot.monthName ?: t("month")
        showsTimeEntry = snapshot.showsTimeEntry
        goalHours = snapshot.goalHours
        baseMinutes = snapshot.monthMinutes
        planned = snapshot.plannedThroughDay
        state = snapshot.publisherState(date)
      } else if (next != null && next.monthKey == key) {
        monthName = next.monthName
        showsTimeEntry = next.showsTimeEntry
        goalHours = next.goalHours
        baseMinutes = 0
        planned = null
        state = "unreported"
      } else {
        return null
      }

      // Entries the phone hasn't counted yet, made this month.
      val counted = (resolvedEntryIds + snapshot.reflectedEntryIds.orEmpty()).toSet()
      val unsynced =
        outbox.mapNotNull { it.request.entry }.filter { it.id !in counted && it.date.startsWith("$key-") }
      if (unsynced.any { it.date == dayKey(date) }) {
        state = "reportedToday"
      } else if (unsynced.isNotEmpty() && state == "unreported") {
        state = "reportedThisMonth"
      }

      if (baseMinutes == null) {
        // Stored by a phone app from before the watch added time itself.
        val reached = goalHours > 0 && snapshot.progress >= 1
        val unit = t("hoursCompact")
        return MonthProgress(
          monthName = monthName,
          showsTimeEntry = showsTimeEntry,
          total = snapshot.monthCompact,
          hours = snapshot.monthCompact.removeSuffix(unit),
          formatted = snapshot.monthFormatted,
          goalHours = goalHours,
          fraction = if (goalHours > 0) snapshot.progress.coerceIn(0.0, 1.0) else null,
          paceFraction = null,
          paceText = if (reached) null else snapshot.paceText,
          goalReached = reached,
          publisherState = state,
        )
      }

      // Credit Time waits for the phone, which applies the credit cap. Standard time always
      // counts in full. An unknown Type is saved as Standard.
      val creditIds = snapshot.categories.filter { it.isCredit != false }.map { it.id }.toSet()
      val unsyncedMinutes =
        unsynced
          .filter { entry -> entry.categoryId?.let { it !in creditIds } ?: true }
          .sumOf { it.hours * 60 + it.minutes }
      val minutes = baseMinutes + unsyncedMinutes

      val total = compact(minutes, t)
      val formatted =
        if (unsyncedMinutes == 0 && snapshot.isCurrent(date)) snapshot.monthFormatted else total

      fun result(fraction: Double?, goalReached: Boolean, paceFraction: Double?, paceText: String?) =
        MonthProgress(
          monthName = monthName,
          showsTimeEntry = showsTimeEntry,
          total = total,
          hours = hoursNumber(minutes),
          formatted = formatted,
          goalHours = goalHours,
          fraction = fraction,
          paceFraction = paceFraction,
          paceText = paceText,
          goalReached = goalReached,
          publisherState = state,
        )

      val goalMinutes = goalHours * 60
      if (goalMinutes <= 0) return result(null, false, null, null)
      val fraction = (minutes.toDouble() / goalMinutes).coerceIn(0.0, 1.0)
      if (minutes >= goalMinutes) return result(fraction, true, null, null)

      // Same pace as the phone: against the Plans through today when there are any,
      // otherwise hours per remaining day.
      val day = date.dayOfMonth
      val plannedMinutes = planned?.getOrNull(day - 1)
      if (plannedMinutes != null && plannedMinutes > 0) {
        return result(
          fraction,
          false,
          minOf(plannedMinutes.toDouble() / goalMinutes, 1.0),
          t(if (minutes >= plannedMinutes) "aheadOfSchedule" else "behindSchedule"),
        )
      }
      val remainingHours = (goalMinutes - minutes).toDouble() / 60
      val daysLeft = daysLeftInMonth(date)
      val perDay = if (daysLeft == 0L) remainingHours else rounded(remainingHours / daysLeft * 10) / 10
      return result(
        fraction,
        false,
        null,
        compact(rounded(perDay * 60).toInt(), t) + " " + t("hoursPerDayToGoal"),
      )
    }

    /** Whole days from `date` to the start of next month, like the phone's `getDaysLeftInCurrentMonth`. */
    private fun daysLeftInMonth(date: ZonedDateTime): Long {
      val nextMonth = date.withDayOfMonth(1).startOfDay().plusMonths(1)
      return ChronoUnit.DAYS.between(date, nextMonth)
    }

    /**
     * The phone's `formatMinutesCompact`: `30m`, `2h`, `1.5h`, `11.5h`; `0h` for zero, as the
     * snapshot's `monthCompact` has it.
     */
    fun compact(minutes: Int, t: (String) -> String): String {
      if (minutes in 1 until 60) return "$minutes" + t("minutesCompact")
      return hoursNumber(minutes) + t("hoursCompact")
    }

    /** Hours as `compact` rounds them, without a unit: `0`, `0.5`, `1.5`, `11.5`. */
    fun hoursNumber(minutes: Int): String {
      val hours = maxOf(minutes, 0).toDouble() / 60
      val tenths = rounded(hours * 10) / 10
      return if (tenths == rounded(tenths)) "${tenths.toInt()}" else String.format(java.util.Locale.ROOT, "%.1f", tenths)
    }

    /** Swift's `rounded()`: to nearest, halves away from zero (Kotlin's `round` rounds halves to even). */
    private fun rounded(value: Double): Double = if (value >= 0) floor(value + 0.5) else -floor(-value + 0.5)
  }
}
