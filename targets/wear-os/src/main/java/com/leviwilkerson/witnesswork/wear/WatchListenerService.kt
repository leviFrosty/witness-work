package com.leviwilkerson.witnesswork.wear

import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.WearableListenerService
import com.leviwilkerson.witnesswork.watchprotocol.WatchProtocol

/**
 * Receives what the phone publishes while the app isn't running, as WatchKit's background
 * WatchConnectivity tasks do, so the complications, tile and timer stay current.
 */
class WatchListenerService : WearableListenerService() {
  override fun onCreate() {
    super.onCreate()
    WatchModel.init(this)
  }

  override fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      if (event.dataItem.uri.path != WatchProtocol.CONTEXT_PATH) continue
      PhoneSession.receive(event.dataItem.data)
    }
  }

  override fun onCapabilityChanged(capabilityInfo: CapabilityInfo) {
    WatchModel.connectionChanged()
  }
}
