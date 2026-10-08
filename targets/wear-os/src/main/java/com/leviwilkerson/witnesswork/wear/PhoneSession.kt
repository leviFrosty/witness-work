package com.leviwilkerson.witnesswork.wear

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.CapabilityInfo
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.WatchProtocol
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply
import com.leviwilkerson.witnesswork.watchprotocol.WatchRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await

/**
 * The watch side of the Wearable Data Layer, as `PhoneSession.swift` is of WatchConnectivity.
 * The phone is the source of truth; everything it publishes is stored before the UI,
 * complications and tile update.
 */
object PhoneSession {
  private const val TAG = "PhoneSession"

  private lateinit var context: Context
  private val reachable = MutableStateFlow(false)

  /** A phone with WitnessWork is connected; a request reaches it even if the app isn't running. */
  val isReachable: StateFlow<Boolean> = reachable

  private val capabilityListener =
    CapabilityClient.OnCapabilityChangedListener { info -> update(info) }

  fun init(context: Context) {
    if (!::context.isInitialized) this.context = context.applicationContext
  }

  /** While the app is open; `WatchListenerService` covers the rest of the time. */
  fun startListening() {
    Wearable.getCapabilityClient(context).addListener(capabilityListener, WatchProtocol.PHONE_CAPABILITY)
  }

  fun stopListening() {
    Wearable.getCapabilityClient(context).removeListener(capabilityListener)
  }

  private fun update(info: CapabilityInfo) {
    reachable.value = info.nodes.isNotEmpty()
  }

  /** Looks the phone up again and reads the context it last published. */
  suspend fun activate() {
    phoneNode()
    try {
      val items = Wearable.getDataClient(context).getDataItems(Uri.parse("wear://*" + WatchProtocol.CONTEXT_PATH)).await()
      try {
        items.forEach { item -> receive(item.data) }
      } finally {
        items.release()
      }
    } catch (error: Exception) {
      Log.w(TAG, "Couldn't read the phone's context", error)
    }
  }

  private suspend fun phoneNode(): Node? =
    try {
      val nodes =
        Wearable.getCapabilityClient(context)
          .getCapability(WatchProtocol.PHONE_CAPABILITY, CapabilityClient.FILTER_REACHABLE)
          .await()
          .nodes
      reachable.value = nodes.isNotEmpty()
      nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
    } catch (error: Exception) {
      Log.w(TAG, "Couldn't look for the phone", error)
      reachable.value = false
      null
    }

  /** Sends `request` and waits for the phone's reply. Throws if the phone can't be reached. */
  suspend fun send(request: WatchRequest): WatchReply {
    val node = phoneNode() ?: throw IllegalStateException("No phone")
    val bytes =
      Wearable.getMessageClient(context).sendRequest(node.id, WatchProtocol.REQUEST_PATH, WatchProtocol.encode(request)).await()
    return WatchProtocol.decode(bytes, WatchReply::fromJson) ?: throw IllegalStateException("Bad reply")
  }

  /**
   * Leaves `request` for whenever the phone is next connected, even if this app isn't running
   * then. The phone deletes it once handled.
   */
  fun transfer(request: WatchRequest) {
    val item = PutDataRequest.create(WatchProtocol.QUEUED_PATH_PREFIX + request.id).setData(WatchProtocol.encode(request)).setUrgent()
    Wearable.getDataClient(context).putDataItem(item)
  }

  /** Stops waiting for the phone to take a queued request, once it was handled another way. */
  fun cancelTransfer(id: String) {
    Wearable.getDataClient(context).deleteDataItems(Uri.parse("wear://*" + WatchProtocol.QUEUED_PATH_PREFIX + id))
  }

  /** Stores a context from the phone and refreshes everything that shows it. */
  fun receive(context: PhoneContext) {
    val previous = WatchStorage.loadContext()
    if (!WatchStorage.saveContextIfNewer(context)) return
    if (previous?.snapshot != context.snapshot) Surfaces.update(this.context)
    TimerOngoingActivity.update(this.context, context.timer, context.snapshot)
    WatchModel.apply(context)
  }

  fun receive(bytes: ByteArray?) {
    WatchProtocol.decode(bytes, PhoneContext::fromJson)?.let(::receive)
  }
}
