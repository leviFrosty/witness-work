package com.leviwilkerson.witnesswork.wear

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Rebuilds the complications and the tile when the watch's time zone or clock changes. Their
 * timelines (each midnight, when Up Next items start) were worked out in the old zone, and
 * nothing else asks for new ones until the phone sends something.
 */
class TimeZoneReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED -> Surfaces.update(context)
    }
  }
}
