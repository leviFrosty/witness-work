package com.leviwilkerson.witnesswork.wear.complications

import android.app.PendingIntent
import android.content.Context
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationText
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataTimeline
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingTimelineComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.TimeInterval
import androidx.wear.watchface.complications.datasource.TimelineEntry
import com.leviwilkerson.witnesswork.watchprotocol.UpNextItem
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.MainActivity
import com.leviwilkerson.witnesswork.wear.R
import com.leviwilkerson.witnesswork.wear.Surfaces
import com.leviwilkerson.witnesswork.wear.UpNext
import com.leviwilkerson.witnesswork.wear.WatchModel
import com.leviwilkerson.witnesswork.wear.WatchStorage
import com.leviwilkerson.witnesswork.wear.now
import java.time.ZonedDateTime

/**
 * Up Next, the counterpart of the Apple Watch's `UpNextComplication`
 * (`targets/watch-widgets/UpNextWidget.swift`): one timeline entry for each time what it shows
 * changes (`UpNext.changes`), so it advances on its own between updates from the phone. Tapping
 * it opens the item in the app.
 *
 * Contacts' names and topics never show here. A watch face stays on screen, dimmed, while the
 * wrist is down, and unlike watchOS, Wear OS can't give a complication different content then;
 * the item opens with them in the app.
 */
class UpNextComplicationService : SuspendingTimelineComplicationDataSourceService() {
  private companion object {
    /** Enough for a week of changes; the app asks for a new timeline with every update. */
    const val MAX_ENTRIES = 60
    const val HIDES_NAMES = true
  }

  override fun onComplicationActivated(complicationInstanceId: Int, type: ComplicationType) {
    Surfaces.setActive(this, Surfaces.UP_NEXT, complicationInstanceId, true)
  }

  override fun onComplicationDeactivated(complicationInstanceId: Int) {
    Surfaces.setActive(this, Surfaces.UP_NEXT, complicationInstanceId, false)
  }

  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    val icon = image(R.drawable.ic_person)
    val heading = text(L10n.t("watchUpNext", null))
    return when (type) {
      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text("3:00"), heading).setMonochromaticImage(icon).build()
      ComplicationType.LONG_TEXT ->
        LongTextComplicationData.Builder(text(L10n.t("followUp", null)), heading)
          .setTitle(text("3:00 PM"))
          .setMonochromaticImage(icon)
          .build()
      else -> null
    }
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationDataTimeline? {
    WatchModel.init(this)
    val snapshot = WatchStorage.loadContext()?.snapshot
    val now = now()
    val default = data(request.complicationType, snapshot, now) ?: return null
    val changes = UpNext.changes(snapshot, now).take(MAX_ENTRIES)
    val entries =
      changes.mapIndexedNotNull { index, start ->
        val end = changes.getOrNull(index + 1) ?: start.plusDays(1)
        data(request.complicationType, snapshot, start)?.let {
          TimelineEntry(TimeInterval(start.toInstant(), end.toInstant()), it)
        }
      }
    return ComplicationDataTimeline(default, entries)
  }

  private fun text(value: String): ComplicationText = PlainComplicationText.Builder(value).build()

  private fun image(id: Int) = MonochromaticImage.Builder(Icon.createWithResource(this, id)).build()

  private fun data(type: ComplicationType, snapshot: WatchSnapshot?, date: ZonedDateTime): ComplicationData? {
    val item = UpNext.items(snapshot, date).firstOrNull()
    val upNext = L10n.t("watchUpNext", snapshot)
    val tap = open(this, item)
    return when (type) {
      ComplicationType.SHORT_TEXT -> {
        val builder =
          when {
            // The time later today (without AM/PM, as the Apple Watch's circular shows it small;
            // faces draw a title larger than the time), otherwise Now or the day.
            item != null ->
              ShortTextComplicationData.Builder(
                  text(UpNext.clock(item, date, snapshot) ?: UpNext.shortWhen(item, date, snapshot)),
                  text(description(item, snapshot, date)),
                )
                .setMonochromaticImage(image(UpNext.icon(item)))
            snapshot != null ->
              ShortTextComplicationData.Builder(text("—"), text(L10n.t("watchNothingScheduled", snapshot)))
                .setMonochromaticImage(image(R.drawable.ic_calendar))
            else -> ShortTextComplicationData.Builder(text("—"), text(upNext))
          }
        builder.setTapAction(tap).build()
      }

      ComplicationType.LONG_TEXT -> {
        val builder =
          when {
            item != null -> {
              val then = UpNext.items(snapshot, date).getOrNull(1)
              val lines =
                listOfNotNull(
                  UpNext.title(item, HIDES_NAMES, snapshot),
                  UpNext.detail(item, HIDES_NAMES),
                  then?.let {
                    "${L10n.t("watchThen", snapshot)} · ${UpNext.shortWhen(it, date, snapshot)} · ${UpNext.title(it, HIDES_NAMES, snapshot)}"
                  },
                )
              LongTextComplicationData.Builder(text(lines.joinToString("\n")), text(description(item, snapshot, date)))
                .setTitle(text(UpNext.heading(item, date, snapshot)))
                .setMonochromaticImage(image(UpNext.icon(item)))
            }
            else ->
              LongTextComplicationData.Builder(
                  text(if (snapshot != null) L10n.t("watchNothingScheduled", snapshot) else "—"),
                  text(upNext),
                )
                .setTitle(text(upNext))
                .setMonochromaticImage(image(R.drawable.ic_calendar))
          }
        builder.setTapAction(tap).build()
      }

      else -> null
    }
  }

  private fun description(item: UpNextItem, snapshot: WatchSnapshot?, date: ZonedDateTime) =
    "${L10n.t("watchUpNext", snapshot)}, ${UpNext.heading(item, date, snapshot)}, ${UpNext.title(item, HIDES_NAMES, snapshot)}"

  /** Opens the item in the app; the app's home when there's none. */
  private fun open(context: Context, item: UpNextItem?): PendingIntent =
    PendingIntent.getActivity(
      context,
      item?.id?.hashCode() ?: 0,
      MainActivity.upNextIntent(context, item?.id),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
