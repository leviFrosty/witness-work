package com.leviwilkerson.witnesswork.wear.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.TransformingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberTransformingLazyColumnState
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.SurfaceTransformation
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.lazy.rememberTransformationSpec
import androidx.wear.compose.material3.lazy.transformedHeight
import com.leviwilkerson.witnesswork.watchprotocol.UpNextItem
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchTimerAction
import com.leviwilkerson.witnesswork.wear.L10n
import com.leviwilkerson.witnesswork.wear.R
import com.leviwilkerson.witnesswork.wear.UpNext
import com.leviwilkerson.witnesswork.wear.WatchModel
import kotlinx.coroutines.launch

/**
 * A Follow-up or Plan from Up Next, opened from Home or the complication: where it is, and for
 * a Plan the service timer. A port of `UpNextView.swift`.
 */
@Composable
fun UpNextScreen(itemId: String) {
  val context by WatchModel.context.collectAsStateWithLifecycle()
  val snapshot = context?.snapshot
  val timer = context?.timer
  val hidesNames = LocalHidesNames.current
  val now = rememberClock()
  val item = UpNext.item(itemId, snapshot)
  val scope = rememberCoroutineScope()
  val haptics = LocalHapticFeedback.current
  val androidContext = LocalContext.current
  val requestNotifications = rememberNotificationPermission()
  var isBusy by remember { mutableStateOf(false) }

  if (item == null) {
    // It's no longer coming up, e.g. answered or moved on the phone.
    ScreenScaffold {
      Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Text(L10n.t("watchNothingScheduled", snapshot), color = Secondary, textAlign = TextAlign.Center)
      }
    }
    return
  }

  val listState = rememberTransformingLazyColumnState()
  val spec = rememberTransformationSpec()
  ScreenScaffold(scrollState = listState) { contentPadding ->
    TransformingLazyColumn(
      state = listState,
      contentPadding = contentPadding,
      verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      item {
        ListHeader(Modifier.transformedHeight(this, spec), transformation = SurfaceTransformation(spec)) {
          // In the accent color, like the watchOS navigation title.
          Text(L10n.t("watchUpNext", snapshot), color = Accent)
        }
      }
      item {
        PlatterRow(
          Modifier.transformedHeight(this, spec).semantics(mergeDescendants = true) {},
          SurfaceTransformation(spec),
        ) {
          Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            IconLabel(UpNext.icon(item), UpNext.heading(item, now, snapshot), Accent)
            Text(
              UpNext.title(item, hidesNames, snapshot),
              style = MaterialTheme.typography.titleMedium,
              fontWeight = FontWeight.Bold,
            )
            UpNext.detail(item, hidesNames)?.let { Footnote(it) }
          }
        }
      }

      item.place?.let { place ->
        item {
          RowButton(
            R.drawable.ic_directions,
            L10n.t("directions", snapshot),
            modifier = Modifier.transformedHeight(this, spec),
            enabled = !isBusy,
            transformation = SurfaceTransformation(spec),
          ) {
            if (!openDirections(androidContext, place)) WatchModel.alertKey.value = "watchDirectionsUnavailable"
          }
        }
      }

      if (item.kind == UpNextItem.Kind.PLAN && snapshot?.showsTimeEntry == true && timer != null) {
        item {
          if (timer.isRunning) {
            val tick = rememberClock(1_000)
            PlatterRow(Modifier.transformedHeight(this, spec), SurfaceTransformation(spec)) {
              IconLabel(R.drawable.ic_timer, formatElapsed(timer.elapsedMs(tick.toInstant().toEpochMilli())), Accent)
            }
          } else {
            RowButton(
              R.drawable.ic_play,
              L10n.t("timerStartAction", snapshot),
              modifier = Modifier.transformedHeight(this, spec),
              enabled = !isBusy,
              transformation = SurfaceTransformation(spec),
            ) {
              isBusy = true
              requestNotifications()
              scope.launch {
                try {
                  WatchModel.setTimer(WatchTimerAction.START, WatchOrigin.UP_NEXT)
                  haptics.performHapticFeedback(HapticFeedbackType.ToggleOn)
                } catch (error: Exception) {
                  WatchModel.show(error)
                }
                isBusy = false
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Opens directions in Maps on the watch; a place without a coordinate is searched by its
 * address. Returns false when there's no maps app to open it.
 */
private fun openDirections(context: Context, place: UpNextItem.Place): Boolean {
  val latitude = place.latitude
  val longitude = place.longitude
  val uri =
    when {
      latitude != null && longitude != null -> Uri.parse("google.navigation:q=$latitude,$longitude")
      place.address != null -> Uri.parse("google.navigation:q=" + Uri.encode(place.address))
      else -> return false
    }
  return try {
    context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    true
  } catch (_: ActivityNotFoundException) {
    false
  }
}
