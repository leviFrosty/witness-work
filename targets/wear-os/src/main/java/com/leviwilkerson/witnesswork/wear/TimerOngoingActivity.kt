package com.leviwilkerson.witnesswork.wear

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot

/**
 * While the phone's timer runs, an Ongoing Activity shows it on the watch face and in the
 * launcher, counting up, with Pause and Stop. The Apple Watch shows the iPhone's timer in the
 * app (and its Live Activity in the Smart Stack); this is Wear OS's place for a running
 * activity. Stop saves the timer's whole minutes as an entry for today and resets it, like
 * "Stop my timer" with Siri.
 */
object TimerOngoingActivity {
  private const val CHANNEL_ID = "timer"
  private const val NOTIFICATION_ID = 1

  fun update(context: Context, timer: TimerSnapshot?, snapshot: WatchSnapshot?) {
    val notifications = NotificationManagerCompat.from(context)
    if (timer == null || !timer.isRunning || snapshot?.showsTimeEntry != true) {
      notifications.cancel(NOTIFICATION_ID)
      return
    }
    if (
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      return
    }
    val title = L10n.t("timer", snapshot)
    notifications.createNotificationChannel(
      NotificationChannel(CHANNEL_ID, title, NotificationManager.IMPORTANCE_DEFAULT).apply {
        setSound(null, null)
        enableVibration(false)
      }
    )

    val elapsedMs = timer.elapsedMs().toLong()
    val open =
      PendingIntent.getActivity(
        context,
        0,
        Intent(context, MainActivity::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    val builder =
      NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_timer)
        .setContentTitle(title)
        .setUsesChronometer(true)
        .setWhen(System.currentTimeMillis() - elapsedMs)
        .setShowWhen(true)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
        .setContentIntent(open)
        .addAction(
          R.drawable.ic_pause,
          L10n.t("timerPauseAction", snapshot),
          QuickActionActivity.pendingIntent(context, QuickActionActivity.Action.PAUSE_ONGOING),
        )
        .addAction(
          R.drawable.ic_stop,
          L10n.t("siriStopTimerShort", snapshot),
          QuickActionActivity.pendingIntent(context, QuickActionActivity.Action.STOP_ONGOING),
        )

    OngoingActivity.Builder(context, NOTIFICATION_ID, builder)
      .setStaticIcon(R.drawable.ic_timer)
      .setTouchIntent(open)
      .setStatus(
        Status.Builder()
          .addTemplate("#time#")
          .addPart("time", Status.StopwatchPart(SystemClock.elapsedRealtime() - elapsedMs))
          .build()
      )
      .build()
      .apply(context)
    notifications.notify(NOTIFICATION_ID, builder.build())
  }
}
