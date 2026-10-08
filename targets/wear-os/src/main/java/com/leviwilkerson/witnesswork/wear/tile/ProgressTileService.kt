package com.leviwilkerson.witnesswork.wear.tile

import androidx.compose.ui.graphics.toArgb
import androidx.concurrent.futures.SuspendToFutureAdapter
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material3.ColorScheme
import androidx.wear.protolayout.material3.MaterialScope
import androidx.wear.protolayout.material3.Typography
import androidx.wear.protolayout.material3.buttonGroup
import androidx.wear.protolayout.material3.circularProgressIndicator
import androidx.wear.protolayout.material3.graphicDataCard
import androidx.wear.protolayout.material3.icon
import androidx.wear.protolayout.material3.iconButton
import androidx.wear.protolayout.material3.materialScope
import androidx.wear.protolayout.material3.primaryLayout
import androidx.wear.protolayout.material3.text
import androidx.wear.protolayout.material3.textEdgeButton
import androidx.wear.protolayout.material3.titleCard
import androidx.wear.protolayout.types.argb
import androidx.wear.protolayout.types.layoutString
import androidx.wear.tiles.EventBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.MainActivity
import com.leviwilkerson.witnesswork.wear.MonthProgress
import com.leviwilkerson.witnesswork.wear.QuickActionActivity
import com.leviwilkerson.witnesswork.wear.R
import com.leviwilkerson.witnesswork.wear.Surfaces
import com.leviwilkerson.witnesswork.wear.WatchModel
import com.leviwilkerson.witnesswork.wear.WatchStorage
import com.leviwilkerson.witnesswork.wear.now
import com.leviwilkerson.witnesswork.wear.startOfDay
import com.leviwilkerson.witnesswork.wear.ui.Accent
import java.time.Duration

/**
 * The Monthly Progress tile: this month toward the goal, with the timer and Add Time a swipe
 * from the watch face. Wear OS's place for what the Apple Watch puts in the Smart Stack (the
 * Monthly Progress widget) and in Siri's quick actions (start and pause the timer, add time).
 * A Kingdom Publisher who doesn't log hours sees whether they've reported this month.
 *
 * Icons are registered as resources the classic way (`onTileResourcesRequest`), which every
 * Wear OS 3+ tile renderer resolves.
 */
class ProgressTileService : TileService() {
  private companion object {
    const val RESOURCES_VERSION = "1"
    const val ICON_PLAY = "play"
    const val ICON_PAUSE = "pause"
    const val ICON_CHECK = "check"
    const val ICON_CIRCLE = "circle"

    val icons =
      mapOf(
        ICON_PLAY to R.drawable.ic_play,
        ICON_PAUSE to R.drawable.ic_pause,
        ICON_CHECK to R.drawable.ic_check_circle,
        ICON_CIRCLE to R.drawable.ic_circle_dashed,
      )
  }

  override fun onTileAddEvent(requestParams: EventBuilders.TileAddEvent) {
    Surfaces.setActive(this, Surfaces.TILE, requestParams.tileId, true)
  }

  override fun onTileRemoveEvent(requestParams: EventBuilders.TileRemoveEvent) {
    Surfaces.setActive(this, Surfaces.TILE, requestParams.tileId, false)
  }

  override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
    SuspendToFutureAdapter.launchFuture {
      WatchModel.init(this@ProgressTileService)
      val context = WatchStorage.loadContext()
      val snapshot = context?.snapshot
      val now = now()
      val progress = snapshot?.let { MonthProgress.of(it, WatchStorage.loadOutbox(), context.resolvedEntryIds, now) }
      val layout =
        materialScope(
          this@ProgressTileService,
          requestParams.deviceConfiguration,
          allowDynamicTheme = false,
          defaultColorScheme = colors(),
        ) {
          when {
            snapshot == null -> message(L10n.t("watchSetUp", null))
            progress == null -> message(L10n.t("watchStale", snapshot))
            progress.showsTimeEntry -> hours(progress, snapshot, context.timer.isRunning)
            else -> report(progress, snapshot)
          }
        }
      // Midnight moves "reported today" and the pace along, and starts the next month.
      val untilMidnight = Duration.between(now, now.startOfDay().plusDays(1)).toMillis()
      TileBuilders.Tile.Builder()
        .setResourcesVersion(RESOURCES_VERSION)
        .setFreshnessIntervalMillis(untilMidnight)
        .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout))
        .build()
    }

  override fun onTileResourcesRequest(
    requestParams: RequestBuilders.ResourcesRequest
  ): ListenableFuture<ResourceBuilders.Resources> =
    SuspendToFutureAdapter.launchFuture {
      val builder = ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION)
      for ((id, drawable) in icons) {
        builder.addIdToImageMapping(
          id,
          ResourceBuilders.ImageResource.Builder()
            .setAndroidResourceByResId(
              ResourceBuilders.AndroidImageResourceByResId.Builder().setResourceId(drawable).build()
            )
            .build(),
        )
      }
      builder.build()
    }

  private fun colors() =
    ColorScheme(
      primary = Accent.toArgb().argb,
      onPrimary = 0xFF000000.toInt().argb,
      primaryContainer = Accent.toArgb().argb,
      onPrimaryContainer = 0xFF000000.toInt().argb,
    )

  private fun MaterialScope.message(text: String): LayoutElementBuilders.LayoutElement =
    primaryLayout(
      mainSlot = { text(text = text.layoutString, maxLines = 4, typography = Typography.BODY_MEDIUM) },
      onClick = open(MainActivity.Route.HOME),
    )

  @Suppress("DEPRECATION") // icon(String): its resources are registered in onTileResourcesRequest.
  private fun MaterialScope.hours(
    progress: MonthProgress,
    snapshot: WatchSnapshot,
    timerRunning: Boolean,
  ): LayoutElementBuilders.LayoutElement {
    val footer = if (progress.goalReached) L10n.t("goalReached", snapshot) else progress.paceText
    return primaryLayout(
      titleSlot = { text(progress.monthName.layoutString) },
      mainSlot = {
        buttonGroup {
          buttonGroupItem {
            graphicDataCard(
              onClick = open(MainActivity.Route.HOME),
              title = { text(progress.total.layoutString) },
              // The goal, then the pace line or Goal reached.
              content =
                listOfNotNull(progress.goalHours.takeIf { it > 0 }?.let { "/$it" }, footer)
                  .joinToString(" ")
                  .ifEmpty { null }
                  ?.let { { text(it.layoutString, maxLines = 3) } },
              graphic = { circularProgressIndicator(staticProgress = (progress.fraction ?: 0.0).toFloat()) },
            )
          }
          buttonGroupItem {
            iconButton(
              onClick =
                quickAction(
                  if (timerRunning) QuickActionActivity.Action.PAUSE_TIMER else QuickActionActivity.Action.START_TIMER
                ),
              iconContent = { icon(if (timerRunning) ICON_PAUSE else ICON_PLAY) },
            )
          }
        }
      },
      bottomSlot = {
        textEdgeButton(onClick = open(MainActivity.Route.ADD_TIME)) {
          text(L10n.t("addTime", snapshot).layoutString)
        }
      },
    )
  }

  @Suppress("DEPRECATION") // icon(String): its resources are registered in onTileResourcesRequest.
  private fun MaterialScope.report(progress: MonthProgress, snapshot: WatchSnapshot): LayoutElementBuilders.LayoutElement =
    primaryLayout(
      titleSlot = { text(progress.monthName.layoutString) },
      mainSlot = {
        titleCard(
          onClick = open(MainActivity.Route.HOME),
          title = { text(L10n.line("sharedTheGoodNews", snapshot).layoutString, maxLines = 2) },
          content =
            if (progress.publisherState == "reportedToday") {
              { text(L10n.t("reportedToday", snapshot).layoutString) }
            } else {
              null
            },
          time = { icon(if (progress.publisherState == "unreported") ICON_CIRCLE else ICON_CHECK) },
        )
      },
    )

  private fun quickAction(action: QuickActionActivity.Action) =
    clickable(QuickActionActivity::class.java.name, mapOf(QuickActionActivity.EXTRA_ACTION to action.name), action.name)

  private fun open(route: MainActivity.Route) =
    clickable(MainActivity::class.java.name, mapOf(MainActivity.EXTRA_ROUTE to route.name), "open-${route.name}")

  private fun clickable(className: String, extras: Map<String, String>, id: String): ModifiersBuilders.Clickable {
    val activity = ActionBuilders.AndroidActivity.Builder().setPackageName(packageName).setClassName(className)
    for ((key, value) in extras) {
      activity.addKeyToExtraMapping(key, ActionBuilders.AndroidStringExtra.Builder().setValue(value).build())
    }
    return ModifiersBuilders.Clickable.Builder()
      .setId(id)
      .setOnClick(ActionBuilders.LaunchAction.Builder().setAndroidActivity(activity.build()).build())
      .build()
  }
}
