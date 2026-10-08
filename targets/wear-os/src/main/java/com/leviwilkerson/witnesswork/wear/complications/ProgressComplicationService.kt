package com.leviwilkerson.witnesswork.wear.complications

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataTimeline
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingTimelineComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.TimeInterval
import androidx.wear.watchface.complications.datasource.TimelineEntry
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.MainActivity
import com.leviwilkerson.witnesswork.wear.MonthProgress
import com.leviwilkerson.witnesswork.wear.R
import com.leviwilkerson.witnesswork.wear.Surfaces
import com.leviwilkerson.witnesswork.wear.WatchModel
import com.leviwilkerson.witnesswork.wear.WatchStorage
import com.leviwilkerson.witnesswork.wear.now
import com.leviwilkerson.witnesswork.wear.startOfDay
import java.time.ZonedDateTime

/**
 * Monthly Progress, the counterpart of the Apple Watch's `ProgressComplication`
 * (`targets/watch-widgets/WatchWidgets.swift`). It reads what the app stored, including time
 * added on the watch that the phone hasn't saved yet. A timeline entry for each coming midnight
 * moves "reported today" and the pace along, and starts the next month, without the phone.
 *
 * Wear OS faces pick the type a slot takes: RANGED_VALUE is the circular gauge, SHORT_TEXT the
 * corner and small slots, LONG_TEXT the rectangular and inline ones. Like the Apple Watch's, the
 * gauge has three styles, each its own complication: the ring (Battery's), the range from 0 to the
 * goal (Weather's), and the gauge with a clock (UV Index's). Faces draw a RANGED_VALUE their own
 * way, so the styles hand them the value, range, number and symbol each one uses.
 */
open class ProgressComplicationService(private val style: Style = Style.RING) :
  SuspendingTimelineComplicationDataSourceService() {
  enum class Style(val kind: String) {
    RING(Surfaces.PROGRESS),
    RANGE(Surfaces.PROGRESS_RANGE),
    SYMBOL(Surfaces.PROGRESS_SYMBOL),
  }

  override fun onComplicationActivated(complicationInstanceId: Int, type: ComplicationType) {
    Surfaces.setActive(this, style.kind, complicationInstanceId, true)
  }

  override fun onComplicationDeactivated(complicationInstanceId: Int) {
    Surfaces.setActive(this, style.kind, complicationInstanceId, false)
  }

  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val sample =
      MonthProgress(
        monthName = L10n.t("month", null),
        showsTimeEntry = true,
        total = "12.5" + L10n.t("hoursCompact", null),
        hours = "12.5",
        formatted = "",
        goalHours = 50,
        fraction = 0.25,
        paceFraction = null,
        paceText = L10n.t("aheadOfSchedule", null),
        goalReached = false,
        publisherState = "unreported",
      )
    return data(this, type, sample, null, style)
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationDataTimeline? {
    WatchModel.init(this)
    val now = now()
    val default = data(this, request.complicationType, progress(now), snapshot(), style) ?: return null
    val entries = mutableListOf<TimelineEntry>()
    var midnight = now.startOfDay()
    repeat(7) {
      val start = midnight.plusDays(1)
      val end = start.plusDays(1)
      data(this, request.complicationType, progress(start), snapshot(), style)?.let {
        entries += TimelineEntry(TimeInterval(start.toInstant(), end.toInstant()), it)
      }
      midnight = start
    }
    return ComplicationDataTimeline(default, entries)
  }

  private fun snapshot(): WatchSnapshot? = WatchStorage.loadContext()?.snapshot

  private fun progress(date: ZonedDateTime): MonthProgress? {
    val context = WatchStorage.loadContext() ?: return null
    val snapshot = context.snapshot ?: return null
    return MonthProgress.of(snapshot, WatchStorage.loadOutbox(), context.resolvedEntryIds, date)
  }

  companion object {
    private fun text(value: String): ComplicationText = PlainComplicationText.Builder(value).build()

    private fun image(context: Context, id: Int) = MonochromaticImage.Builder(Icon.createWithResource(context, id)).build()

    private fun reportIcon(progress: MonthProgress) =
      if (progress.publisherState == "unreported") R.drawable.ic_circle_dashed else R.drawable.ic_check_circle

    private fun open(context: Context): PendingIntent =
      PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )

    /** `null` progress is before the first snapshot, or once its month and the next have ended. */
    fun data(
      context: Context,
      type: ComplicationType,
      progress: MonthProgress?,
      snapshot: WatchSnapshot?,
      style: Style = Style.RING,
    ): ComplicationData? {
      val sharedTheGoodNews = L10n.line("sharedTheGoodNews", snapshot)
      // The range and symbol styles are circular only, like the Apple Watch's.
      if (style != Style.RING && type != ComplicationType.RANGED_VALUE) return null
      return when (type) {
        ComplicationType.RANGED_VALUE -> {
          val builder =
            when {
              progress == null ->
                RangedValueComplicationData.Builder(0f, 0f, 1f, text("—")).setText(text("—"))
              // Without a goal there's nothing to fill: the number under an HOURS caption, like
              // Calendar's Today's Date.
              progress.showsTimeEntry && progress.goalHours <= 0 ->
                RangedValueComplicationData.Builder(0f, 0f, 1f, text(progress.total))
                  .setTitle(text(L10n.line("hours", snapshot).uppercase()))
                  .setText(text(progress.hours))
              progress.showsTimeEntry ->
                when (style) {
                  // Hours from 0 to the goal.
                  Style.RANGE ->
                    RangedValueComplicationData.Builder(
                      ((progress.fraction ?: 0.0) * progress.goalHours).toFloat(),
                      0f,
                      progress.goalHours.toFloat(),
                      text(totalOfGoal(progress)),
                    )
                  else ->
                    RangedValueComplicationData.Builder(
                      (progress.fraction ?: 0.0).toFloat(),
                      0f,
                      1f,
                      text(totalOfGoal(progress)),
                    )
                }
                  // The bare number, as Apple's gauges show it; a unit shrinks the digits.
                  .setText(text(progress.hours))
                  .apply { if (style == Style.SYMBOL) setMonochromaticImage(image(context, R.drawable.ic_clock)) }
              else ->
                RangedValueComplicationData.Builder(
                    if (progress.publisherState == "unreported") 0f else 1f,
                    0f,
                    1f,
                    text(sharedTheGoodNews),
                  )
                  .setMonochromaticImage(image(context, reportIcon(progress)))
            }
          builder.setTapAction(open(context)).build()
        }

        ComplicationType.SHORT_TEXT -> {
          val builder =
            when {
              progress == null -> ShortTextComplicationData.Builder(text("—"), text("—"))
              progress.showsTimeEntry ->
                // The total alone, as in the Apple Watch's corner: faces draw a title larger.
                ShortTextComplicationData.Builder(text(progress.total), text(totalOfGoal(progress)))
                  .setMonochromaticImage(image(context, R.drawable.ic_clock))
              // A Kingdom Publisher gets the month as the text and the status as the icon, as
              // in the Apple Watch's corner.
              else ->
                ShortTextComplicationData.Builder(text(progress.monthName), text(sharedTheGoodNews))
                  .setMonochromaticImage(image(context, reportIcon(progress)))
            }
          builder.setTapAction(open(context)).build()
        }

        ComplicationType.LONG_TEXT -> {
          val builder =
            when {
              progress == null -> LongTextComplicationData.Builder(text("—"), text("—"))
              progress.showsTimeEntry -> {
                val footer =
                  if (progress.goalReached) L10n.t("goalReached", snapshot) else progress.paceText
                LongTextComplicationData.Builder(text(footer ?: totalOfGoal(progress)), text(totalOfGoal(progress)))
                  .setTitle(text("${progress.monthName} · ${totalOfGoal(progress)}"))
                  .setMonochromaticImage(image(context, R.drawable.ic_clock))
              }
              else -> {
                val status =
                  if (progress.publisherState == "reportedToday") {
                    "$sharedTheGoodNews · ${L10n.t("reportedToday", snapshot)}"
                  } else {
                    sharedTheGoodNews
                  }
                LongTextComplicationData.Builder(text(status), text(status))
                  .setTitle(text(progress.monthName))
                  .setMonochromaticImage(image(context, reportIcon(progress)))
              }
            }
          builder.setTapAction(open(context)).build()
        }

        else -> null
      }
    }

    /** `12.5h / 50`, or the total alone without a goal (the Apple Watch's inline text). */
    private fun totalOfGoal(progress: MonthProgress) =
      if (progress.goalHours > 0) "${progress.total} / ${progress.goalHours}" else progress.total
  }
}

/** Monthly Progress as a gauge from 0 to the goal (the Apple Watch's `ProgressRangeComplication`). */
class ProgressRangeComplicationService : ProgressComplicationService(Style.RANGE)

/** Monthly Progress as a gauge with a clock (the Apple Watch's `ProgressSymbolComplication`). */
class ProgressSymbolComplicationService : ProgressComplicationService(Style.SYMBOL)
