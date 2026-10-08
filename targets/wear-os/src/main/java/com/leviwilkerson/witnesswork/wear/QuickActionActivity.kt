package com.leviwilkerson.witnesswork.wear

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.wear.compose.material3.AlertDialog
import androidx.wear.compose.material3.AlertDialogDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.SuccessConfirmationDialog
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.confirmationDialogCurvedText
import androidx.wear.compose.material3.MaterialTheme
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchTimerAction
import com.leviwilkerson.witnesswork.wear.ui.WitnessWorkTheme

/**
 * Runs one action from the tile or the timer's notification, then confirms it, as Siri answers
 * an action on the Apple Watch ("Timer started"). Wear OS has no voice actions for other apps;
 * these are its closest quick actions.
 */
class QuickActionActivity : ComponentActivity() {
  enum class Action(val origin: WatchOrigin) {
    START_TIMER(WatchOrigin.TILE),
    PAUSE_TIMER(WatchOrigin.TILE),
    PAUSE_ONGOING(WatchOrigin.ONGOING_ACTIVITY),
    /** Saves the timer's whole minutes for today and resets it, like "Stop my timer". */
    STOP_ONGOING(WatchOrigin.ONGOING_ACTIVITY),
  }

  companion object {
    const val EXTRA_ACTION = "action"

    fun pendingIntent(context: Context, action: Action): PendingIntent =
      PendingIntent.getActivity(
        context,
        100 + action.ordinal,
        Intent(context, QuickActionActivity::class.java)
          .putExtra(EXTRA_ACTION, action.name)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
  }

  /** A translation key, and whether it's a success. */
  private data class Outcome(val key: String, val succeeded: Boolean)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WatchModel.init(this)
    val action = intent.getStringExtra(EXTRA_ACTION)?.let { name -> Action.entries.firstOrNull { it.name == name } }
    if (action == null) {
      finish()
      return
    }
    setContent { WitnessWorkTheme { QuickAction(action) } }
  }

  @Composable
  private fun QuickAction(action: Action) {
    var outcome by remember { mutableStateOf<Outcome?>(null) }
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(action) {
      val result = perform(action)
      haptics.performHapticFeedback(if (result.succeeded) HapticFeedbackType.Confirm else HapticFeedbackType.Reject)
      outcome = result
    }
    val snapshot = WatchModel.snapshot
    val result = outcome
    when {
      result == null ->
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
      result.succeeded -> {
        val message = L10n.line(result.key, snapshot)
        val style = MaterialTheme.typography.arcLarge
        SuccessConfirmationDialog(
          visible = true,
          onDismissRequest = ::finish,
          curvedText = { confirmationDialogCurvedText(message, style) },
        )
      }
      else ->
        AlertDialog(
          visible = true,
          onDismissRequest = ::finish,
          title = { Text(L10n.t(result.key, snapshot), maxLines = Int.MAX_VALUE) },
          edgeButton = { AlertDialogDefaults.EdgeButton(onClick = ::finish) { Text(L10n.t("ok", snapshot)) } },
        )
    }
  }

  private suspend fun perform(action: Action): Outcome =
    try {
      val key =
        when (action) {
          Action.START_TIMER -> {
            WatchModel.timeEntrySnapshot()
            WatchModel.setTimer(WatchTimerAction.START, action.origin)
            "siriTimerStarted"
          }
          Action.PAUSE_TIMER, Action.PAUSE_ONGOING -> {
            WatchModel.timeEntrySnapshot()
            WatchModel.setTimer(WatchTimerAction.PAUSE, action.origin)
            "siriTimerPaused"
          }
          Action.STOP_ONGOING -> {
            WatchModel.timeEntrySnapshot()
            WatchModel.stopTimer(categoryId = null, origin = action.origin)
            "siriTimerSaved"
          }
        }
      Outcome(key, succeeded = true)
    } catch (error: ServiceActionException) {
      Outcome(error.error.key, succeeded = false)
    } catch (_: Exception) {
      Outcome(ServiceActionError.FAILED.key, succeeded = false)
    } finally {
      Surfaces.update(this)
    }
}
