package expo.modules.watchbridge

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import com.leviwilkerson.witnesswork.watchprotocol.WatchProtocol

/**
 * Receives the Wear OS watch's requests, even while the app isn't running, as WatchConnectivity
 * delivers the Apple Watch's on iOS: an RPC the watch waits on (a message with a reply), or a
 * data item it queued while the phone was away (`transferUserInfo`).
 */
class WatchBridgeListenerService : WearableListenerService() {
  private val coordinator
    get() = WatchSessionCoordinator.get(applicationContext)

  override fun onRequest(nodeId: String, path: String, request: ByteArray): Task<ByteArray>? {
    if (path != WatchProtocol.REQUEST_PATH) return null
    return Tasks.forResult(WatchProtocol.encode(coordinator.process(request)))
  }

  override fun onDataChanged(events: DataEventBuffer) {
    var handled = false
    for (event in events) {
      val item = event.dataItem
      if (event.type != DataEvent.TYPE_CHANGED) continue
      if (item.uri.path?.startsWith(WatchProtocol.QUEUED_PATH_PREFIX) != true) continue
      coordinator.process(item.data ?: continue)
      // Handled (or refused for good); a repeat delivery would be recognized by id anyway.
      Wearable.getDataClient(this).deleteDataItems(item.uri)
      handled = true
    }
    if (handled) coordinator.publishSoon()
  }

  override fun onCapabilityChanged(capabilityInfo: CapabilityInfo) {
    coordinator.refreshStatus()
  }
}
