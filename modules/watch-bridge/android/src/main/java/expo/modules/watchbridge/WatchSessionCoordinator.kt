package expo.modules.watchbridge

import android.content.Context
import android.util.Log
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.PutDataRequest
import com.google.android.gms.wearable.Wearable
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchEntryDraft
import com.leviwilkerson.witnesswork.watchprotocol.WatchProtocol
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchTripDraft
import expo.modules.stopwatchbridge.StopwatchState
import expo.modules.stopwatchbridge.StopwatchStore
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors

/**
 * Owns the phone side of the Wearable Data Layer for the life of the process, like
 * `WatchSessionCoordinator.swift` does for WatchConnectivity. Requests from the watch arrive in
 * `WatchBridgeListenerService`, even while the app isn't running: timer commands run against
 * `StopwatchStore`, and new entries and trips are stored in the inbox until JS saves them
 * (`src/app/watch/watchSync.ts`). Everything the watch shows is published as one data item,
 * the `PhoneContext`.
 */
class WatchSessionCoordinator private constructor(context: Context) {
  companion object {
    private const val TAG = "WatchBridge"
    private const val INBOX_FILE = "WatchBridge/inbox.json"
    /** Kind the Wear OS app reports for its tile, alongside complication kinds. */
    const val TILE_KIND = "WitnessWorkTile"

    @Volatile private var instance: WatchSessionCoordinator? = null

    fun get(context: Context): WatchSessionCoordinator =
      instance
        ?: synchronized(this) {
          instance ?: WatchSessionCoordinator(context.applicationContext).also { instance = it }
        }
  }

  data class Status(
    val isSupported: Boolean = false,
    val isPaired: Boolean = false,
    val isWatchAppInstalled: Boolean = false,
  )

  private val context = context.applicationContext
  private val lock = Any()
  // Guarded by `lock`.
  private var inbox = WatchInbox()
  private var loaded = false
  @Volatile private var status = Status()

  /** Background work: Data Layer calls block, and never on the main thread. */
  private val worker = Executors.newSingleThreadExecutor { Thread(it, "WatchBridge") }
  private val inboxListeners = CopyOnWriteArraySet<() -> Unit>()
  private val statusListeners = CopyOnWriteArraySet<() -> Unit>()

  private val timer =
    object : WatchTimer {
      override fun snapshot() = StopwatchStore.load(context).toTimer()

      override fun start() = StopwatchStore.start(context).toTimer()

      override fun pause() = StopwatchStore.pause(context).toTimer()

      override fun reset() = StopwatchStore.reset(context).toTimer()
    }

  private val handler =
    WatchRequestHandler(
      inbox = { loadIfNeeded().takeIf { loaded } },
      timer = timer,
      persist = ::persist,
      notifyJS = ::notifyJS,
    )

  init {
    // A change made in the app, by the watch or anywhere else reaches the watch.
    StopwatchStore.addListener { publishSoon() }
    refreshStatus()
  }

  private fun StopwatchState.toTimer() =
    TimerSnapshot(
      isRunning = isRunning,
      startedAt = startedAt,
      accumulatedMs = accumulatedMs,
      revision = StopwatchStore.commandCounter(context),
    )

  // MARK: Listeners (the JS module)

  fun addInboxListener(listener: () -> Unit) = inboxListeners.add(listener)

  fun removeInboxListener(listener: () -> Unit) = inboxListeners.remove(listener)

  fun addStatusListener(listener: () -> Unit) = statusListeners.add(listener)

  fun removeStatusListener(listener: () -> Unit) = statusListeners.remove(listener)

  private fun notifyJS() = inboxListeners.forEach { it() }

  // MARK: JS API

  fun status(): Status = status

  fun activeComplications(): List<String>? = synchronized(lock) { loadIfNeeded().complications }

  /** Throws if `json` isn't a snapshot the watch can read. */
  fun setSnapshot(json: String) {
    val snapshot = WatchSnapshot.fromJson(JSONObject(json))
    synchronized(lock) {
      loadIfNeeded()
      if (!loaded) return
      inbox.snapshot = snapshot
      persist()
    }
    publishSoon()
  }

  fun pendingEntries(): List<WatchEntryDraft> = synchronized(lock) { loadIfNeeded().pending.map { it.draft } }

  fun pendingTrips(): List<WatchTripDraft> = synchronized(lock) { loadIfNeeded().pendingTrips.map { it.draft } }

  /** JS saved or refused these; the watch stops showing them as syncing once it hears so. */
  fun resolveEntries(ids: List<String>) {
    synchronized(lock) {
      loadIfNeeded()
      if (!loaded) return
      val resolved = ids.toSet()
      inbox.pending.removeAll { it.draft.id in resolved }
      inbox.pendingTrips.removeAll { it.draft.id in resolved }
      for (id in ids) if (id !in inbox.resolvedEntryIds) inbox.resolvedEntryIds.add(id)
      inbox.resolvedEntryIds =
        inbox.resolvedEntryIds.takeLast(WatchRequestHandler.MAX_RESOLVED_IDS).toMutableList()
      persist()
    }
    publishSoon()
  }

  fun takeEvents(): List<WatchInbox.Event> =
    synchronized(lock) {
      loadIfNeeded()
      if (!loaded || inbox.events.isEmpty()) return emptyList()
      val events = inbox.events.toList()
      inbox.events = mutableListOf()
      persist()
      events
    }

  // MARK: Requests (WatchBridgeListenerService)

  fun process(message: ByteArray): WatchReply = synchronized(lock) { handler.process(message) }

  // MARK: Publishing

  /** Publishes the context off the calling thread. */
  fun publishSoon() {
    worker.execute { publish() }
  }

  /**
   * Replaces the context data item. The Data Layer keeps it and syncs it to the watch whenever
   * they connect, like WatchConnectivity's application context. Only once a watch has the app.
   */
  private fun publish() {
    if (!status.isWatchAppInstalled) return
    val payload =
      synchronized(lock) {
        loadIfNeeded()
        if (!loaded) return
        WatchProtocol.encode(handler.makeContext(inbox))
      }
    try {
      val request = PutDataRequest.create(WatchProtocol.CONTEXT_PATH).setData(payload).setUrgent()
      Tasks.await(Wearable.getDataClient(context).putDataItem(request))
    } catch (error: Exception) {
      Log.w(TAG, "Couldn't publish the watch context", error)
    }
  }

  // MARK: Status

  /**
   * Looks for paired watches and ones with the app, then publishes to them. Tells the status
   * listeners when it changed, or always with `announce` (JS that just started listening).
   */
  fun refreshStatus(announce: Boolean = false) {
    worker.execute {
      val supported =
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
      val next =
        if (!supported) {
          Status()
        } else {
          try {
            val connected = Tasks.await(Wearable.getNodeClient(context).connectedNodes)
            val withApp =
              Tasks.await(
                Wearable.getCapabilityClient(context)
                  .getCapability(WatchProtocol.WATCH_CAPABILITY, CapabilityClient.FILTER_ALL)
              ).nodes
            Status(isSupported = true, isPaired = connected.isNotEmpty() || withApp.isNotEmpty(), isWatchAppInstalled = withApp.isNotEmpty())
          } catch (error: Exception) {
            // No Wear OS companion app (the Wearable API is missing) or no watch.
            Log.i(TAG, "No Wear OS watch: ${error.message}")
            Status(isSupported = true)
          }
        }
      val changed = next != status
      status = next
      publish()
      if (changed || announce) statusListeners.forEach { it() }
    }
  }

  // MARK: Storage

  private val inboxFile: File
    get() = File(context.filesDir, INBOX_FILE)

  /** Call with `lock` held. */
  private fun loadIfNeeded(): WatchInbox {
    if (loaded) return inbox
    val file = inboxFile
    if (!file.exists()) {
      loaded = true
      return inbox
    }
    inbox =
      try {
        WatchInbox.fromJson(JSONObject(file.readText()))
      } catch (error: Exception) {
        Log.w(TAG, "Unreadable watch inbox; starting over", error)
        WatchInbox()
      }
    loaded = true
    return inbox
  }

  /** Call with `lock` held. Writes atomically. */
  private fun persist(): Boolean {
    if (!loaded) return false
    return try {
      val file = inboxFile
      file.parentFile?.mkdirs()
      val temporary = File(file.parentFile, "${file.name}.tmp")
      temporary.writeText(inbox.toJson().toString())
      temporary.renameTo(file)
    } catch (error: Exception) {
      Log.w(TAG, "Couldn't store the watch inbox", error)
      false
    }
  }
}
