package com.leviwilkerson.witnesswork.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.TransformingLazyColumnItemScope
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.SurfaceTransformation
import androidx.wear.compose.material3.lazy.TransformationSpec
import androidx.wear.compose.material3.lazy.rememberTransformationSpec
import androidx.wear.compose.material3.lazy.transformedHeight
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.UpNextItem
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchTimerAction
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.MonthProgress
import com.leviwilkerson.witnesswork.wear.R
import com.leviwilkerson.witnesswork.wear.UpNext
import com.leviwilkerson.witnesswork.wear.WatchModel
import kotlinx.coroutines.launch
import java.time.ZonedDateTime

/** The app's home, a port of `HomeView.swift`. */
@Composable
fun HomeScreen(
  snapshot: WatchSnapshot,
  onAddTime: (hours: Int, minutes: Int, fromTimer: Boolean) -> Unit,
  onUpNext: (String) -> Unit,
) {
  // Up Next and the month move on with the clock, not only with new data.
  val now = rememberClock()
  val context by WatchModel.context.collectAsStateWithLifecycle()
  val outbox by WatchModel.outbox.collectAsStateWithLifecycle()
  val progress = remember(context, outbox, now) { WatchModel.progress(now) }
  val timer = context?.timer
  val listState = rememberTransformingLazyColumnState()
  val spec = rememberTransformationSpec()

  ScreenScaffold(scrollState = listState) { contentPadding ->
    TransformingLazyColumn(
      state = listState,
      contentPadding = contentPadding,
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      if (progress == null) {
        item {
          Text(
            L10n.t("watchStale", snapshot),
            style = MaterialTheme.typography.bodySmall,
            color = Secondary,
            textAlign = TextAlign.Center,
            modifier = rowModifier(spec).padding(horizontal = 28.dp),
          )
        }
      }

      if (progress?.showsTimeEntry ?: snapshot.showsTimeEntry) {
        if (progress != null) item { ProgressSection(snapshot, progress, rowModifier(spec), SurfaceTransformation(spec)) }
        if (timer != null) {
          item { TimerReadout(snapshot, timer, rowModifier(spec), SurfaceTransformation(spec)) }
          item { TimerToggle(snapshot, timer, rowModifier(spec), SurfaceTransformation(spec)) }
          val canSave = !timer.isRunning && timer.elapsedMs() >= 60_000
          if (canSave) {
            item {
              val elapsed = timer.elapsedMs().toLong()
              RowButton(
                R.drawable.ic_save,
                L10n.t("timerSaveAction", snapshot),
                modifier = rowModifier(spec),
                transformation = SurfaceTransformation(spec),
              ) {
                onAddTime((elapsed / 3_600_000).toInt(), ((elapsed / 60_000) % 60).toInt(), true)
              }
            }
          }
        }
        item {
          RowButton(
            R.drawable.ic_plus,
            L10n.t("addTime", snapshot),
            modifier = rowModifier(spec),
            transformation = SurfaceTransformation(spec),
          ) {
            onAddTime(0, 0, false)
          }
        }
      } else {
        item { ReportStatusSection(snapshot, progress, rowModifier(spec), SurfaceTransformation(spec)) }
      }

      item { UpNextSection(snapshot, now, onUpNext, rowModifier(spec), SurfaceTransformation(spec)) }

      if (outbox.isNotEmpty()) {
        item {
          IconLabel(
            R.drawable.ic_sync,
            L10n.t("watchSyncing", snapshot),
            Secondary,
            rowModifier(spec).padding(horizontal = 12.dp),
          )
        }
      }
    }
  }
}

/** A row's height, morphing at the screen's edges. */
private fun TransformingLazyColumnItemScope.rowModifier(spec: TransformationSpec) =
  Modifier.fillMaxWidth().transformedHeight(this, spec)

/** A list button with an icon, like a watchOS `Button` with a `Label`. */
@Composable
fun RowButton(
  icon: Int,
  label: String,
  modifier: Modifier = Modifier,
  enabled: Boolean = true,
  transformation: SurfaceTransformation? = null,
  onClick: () -> Unit,
) {
  FilledTonalButton(
    onClick = onClick,
    enabled = enabled,
    modifier = modifier.fillMaxWidth(),
    transformation = transformation,
    // White like the label, as in a watchOS list.
    icon = {
      Icon(
        painterResource(icon),
        contentDescription = null,
        tint = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.size(20.dp),
      )
    },
    label = { Text(label, maxLines = 2, overflow = TextOverflow.Ellipsis) },
  )
}

@Composable
private fun ProgressSection(
  snapshot: WatchSnapshot,
  progress: MonthProgress,
  modifier: Modifier,
  transformation: SurfaceTransformation,
) {
  PlatterRow(modifier.semantics(mergeDescendants = true) {}, transformation) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
      SectionLabel(progress.monthName)
      Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(progress.formatted, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        // The goal is whole hours the user entered.
        if (progress.goalHours > 0) {
          Text(
            "/${progress.goalHours}",
            style = MaterialTheme.typography.bodyLarge,
            color = Secondary,
            modifier = Modifier.padding(bottom = 1.dp),
          )
        }
      }
      progress.fraction?.let { PaceBar(it, progress.paceFraction, Modifier.padding(vertical = 2.dp)) }
      if (progress.goalReached) {
        IconLabel(R.drawable.ic_check_circle, L10n.t("goalReached", snapshot), Accent)
      } else {
        progress.paceText?.let { Footnote(it) }
      }
    }
  }
}

@Composable
private fun TimerReadout(
  snapshot: WatchSnapshot,
  timer: TimerSnapshot,
  modifier: Modifier,
  transformation: SurfaceTransformation,
) {
  // Counts every second while running.
  val now = rememberClock(if (timer.isRunning) 1_000 else 60_000)
  PlatterRow(modifier.semantics(mergeDescendants = true) {}, transformation) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
      SectionLabel(L10n.t("timer", snapshot))
      Text(
        formatElapsed(timer.elapsedMs(now.toInstant().toEpochMilli())),
        style = MaterialTheme.typography.titleMedium.copy(fontFeatureSettings = "tnum"),
      )
    }
  }
}

@Composable
private fun TimerToggle(
  snapshot: WatchSnapshot,
  timer: TimerSnapshot,
  modifier: Modifier,
  transformation: SurfaceTransformation,
) {
  val scope = rememberCoroutineScope()
  val haptics = LocalHapticFeedback.current
  val requestNotifications = rememberNotificationPermission()
  var isSending by remember { mutableStateOf(false) }
  RowButton(
    if (timer.isRunning) R.drawable.ic_pause else R.drawable.ic_play,
    L10n.t(if (timer.isRunning) "timerPauseAction" else "timerStartAction", snapshot),
    modifier = modifier,
    enabled = !isSending,
    transformation = transformation,
  ) {
    isSending = true
    if (!timer.isRunning) requestNotifications()
    scope.launch {
      try {
        WatchModel.setTimer(if (timer.isRunning) WatchTimerAction.PAUSE else WatchTimerAction.START, WatchOrigin.APP)
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
      } catch (error: Exception) {
        WatchModel.show(error)
      }
      isSending = false
    }
  }
}

/**
 * Regular Publishers who don't log hours report whether they shared in the ministry this month,
 * the same check-off as the phone's checkbox card.
 */
@Composable
private fun ReportStatusSection(
  snapshot: WatchSnapshot,
  progress: MonthProgress?,
  modifier: Modifier,
  transformation: SurfaceTransformation,
) {
  val scope = rememberCoroutineScope()
  val haptics = LocalHapticFeedback.current
  val state = progress?.publisherState ?: "unreported"
  if (state == "unreported") {
    RowButton(
      R.drawable.ic_circle,
      L10n.line("sharedTheGoodNews", snapshot),
      modifier = modifier,
      transformation = transformation,
    ) {
      scope.launch {
        WatchModel.addEntry(hours = 0, minutes = 0, categoryId = null, origin = WatchOrigin.APP)
        haptics.performHapticFeedback(HapticFeedbackType.Confirm)
      }
    }
  } else {
    PlatterRow(modifier.semantics(mergeDescendants = true) {}, transformation) {
      Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        IconLabel(R.drawable.ic_check_circle, L10n.line("sharedTheGoodNews", snapshot), Accent)
        if (state == "reportedToday") Footnote(L10n.t("reportedToday", snapshot))
      }
    }
  }
}

/** The next Follow-up or Plan; opens it with Directions and the timer. */
@Composable
private fun UpNextSection(
  snapshot: WatchSnapshot,
  now: ZonedDateTime,
  onUpNext: (String) -> Unit,
  modifier: Modifier,
  transformation: SurfaceTransformation,
) {
  val hidesNames = LocalHidesNames.current
  val item: UpNextItem? = UpNext.items(snapshot, now).firstOrNull()
  if (item == null) {
    PlatterRow(modifier.semantics(mergeDescendants = true) {}, transformation) {
      Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        SectionLabel(L10n.t("watchUpNext", snapshot))
        Footnote(L10n.t("watchNothingScheduled", snapshot))
      }
    }
    return
  }
  Card(onClick = { onUpNext(item.id) }, modifier = modifier, transformation = transformation) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
      SectionLabel(L10n.t("watchUpNext", snapshot))
      IconLabel(UpNext.icon(item), UpNext.heading(item, now, snapshot), Accent, maxLines = 1)
      Text(
        UpNext.title(item, hidesNames, snapshot),
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
      )
      UpNext.detail(item, hidesNames)?.let { Footnote(it, maxLines = 2) }
    }
  }
}
