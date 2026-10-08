package com.leviwilkerson.witnesswork.wear

import android.content.Context
import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchEntryDraft
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply
import com.leviwilkerson.witnesswork.watchprotocol.WatchRequest
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchTimerAction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.ZonedDateTime
import java.util.UUID

/**
 * State behind the watch UI, the tile and the quick actions: a port of `WatchModel.swift`.
 *
 * Entries are kept in a stored outbox until the phone app has saved them: sent as a request
 * when the phone is reachable, and as a queued data item otherwise. Each one's id is its id on
 * the phone, so sending it more than once is safe. Timer commands need the phone right away
 * and aren't queued. Changes run one at a time, like Swift's main actor.
 */
@OptIn(ExperimentalCoroutinesApi::class)
object WatchModel {
  /** Entries the phone app hasn't reported handled within this time are dropped. */
  private const val OUTBOX_LIFETIME_MS = 30L * 24 * 60 * 60 * 1000

  /** One change at a time; a change waiting on the phone lets others run, as on watchOS. */
  private val serial = Dispatchers.Default.limitedParallelism(1)
  val scope = CoroutineScope(SupervisorJob() + serial)

  private lateinit var appContext: Context
  private val contextState = MutableStateFlow<PhoneContext?>(null)
  private val outboxState = MutableStateFlow<List<OutboxItem>>(emptyList())

  /** The phone's latest context. */
  val context: StateFlow<PhoneContext?> = contextState
  val outbox: StateFlow<List<OutboxItem>> = outboxState

  /** Translation key of a message to show, if any. */
  val alertKey = MutableStateFlow<String?>(null)

  val snapshot: WatchSnapshot?
    get() = contextState.value?.snapshot

  val timer: TimerSnapshot?
    get() = contextState.value?.timer

  fun init(context: Context) {
    if (::appContext.isInitialized) return
    appContext = context.applicationContext
    WatchStorage.init(appContext)
    L10n.init(appContext)
    PhoneSession.init(appContext)
    contextState.value = WatchStorage.loadContext()
    outboxState.value = WatchStorage.loadOutbox()
  }

  /** The month as the complications show it, with entries still on their way to the phone. */
  fun progress(date: ZonedDateTime = now()): MonthProgress? {
    val context = contextState.value ?: return null
    val snapshot = context.snapshot ?: return null
    return MonthProgress.of(snapshot, outboxState.value, context.resolvedEntryIds, date)
  }

  // MARK: Incoming

  fun apply(context: PhoneContext) {
    scope.launch {
      if (context.sentAt < (contextState.value?.sentAt ?: 0.0)) return@launch
      contextState.value = context
      val resolved = context.resolvedEntryIds.toSet()
      val cutoff = System.currentTimeMillis() - OUTBOX_LIFETIME_MS
      val outbox = outboxState.value
      val remaining = outbox.filter { it.id !in resolved && it.createdAtMs > cutoff }
      if (remaining.size != outbox.size) {
        outbox.filter { it !in remaining }.forEach { PhoneSession.cancelTransfer(it.id) }
        saveOutbox(remaining)
      }
    }
  }

  fun connectionChanged() {
    scope.launch { refresh() }
  }

  /** Asks the phone for fresh data and resends anything it hasn't accepted. */
  suspend fun refresh() =
    withContext(serial) {
      PhoneSession.activate()
      if (!PhoneSession.isReachable.value) return@withContext
      val hello = WatchRequest(kind = WatchRequest.Kind.HELLO, complications = Surfaces.activeKinds(appContext))
      runCatching { PhoneSession.send(hello) }.getOrNull()?.context?.let(PhoneSession::receive)
      for (item in outboxState.value.filter { !it.delivered }) {
        val reply = runCatching { PhoneSession.send(item.request) }.getOrNull() ?: return@withContext
        handle(reply, item.id)
      }
    }

  // MARK: Entries

  /**
   * Adds a Time Entry for today. Returns once it's stored and handed to the connection; the
   * phone app saves it when it next runs.
   */
  suspend fun addEntry(hours: Int, minutes: Int, categoryId: String?, origin: WatchOrigin) =
    withContext(serial) {
      val entry =
        WatchEntryDraft(
          id = newId(),
          date = dayKey(now()),
          hours = hours,
          minutes = minutes,
          categoryId = categoryId,
          origin = origin,
        )
      enqueue(WatchRequest(kind = WatchRequest.Kind.ADD_ENTRY, id = entry.id, entry = entry, origin = origin))
    }

  private suspend fun enqueue(request: WatchRequest) {
    saveOutbox(outboxState.value + OutboxItem(request, System.currentTimeMillis(), delivered = false))
    val reply = runCatching { PhoneSession.send(request) }.getOrNull()
    if (reply != null) {
      handle(reply, request.id)
      // Only a temporarily unavailable phone is worth queuing for later.
      if (reply.reason != WatchReply.Reason.UNAVAILABLE) return
    }
    PhoneSession.transfer(request)
  }

  private fun handle(reply: WatchReply, id: String) {
    reply.context?.let(PhoneSession::receive)
    val outbox = outboxState.value
    val index = outbox.indexOfFirst { it.id == id }
    if (index < 0) return
    when {
      reply.status == WatchReply.Status.ACCEPTED ->
        saveOutbox(outbox.toMutableList().also { it[index] = it[index].copy(delivered = true) })
      // The phone couldn't store it; try again later.
      reply.reason == WatchReply.Reason.UNAVAILABLE -> return
      else -> saveOutbox(outbox.filterIndexed { i, _ -> i != index })
    }
  }

  // MARK: Timer

  suspend fun setTimer(action: WatchTimerAction, origin: WatchOrigin) =
    withContext(serial) {
      val reply =
        try {
          PhoneSession.send(WatchRequest(kind = WatchRequest.Kind.TIMER, timerAction = action, origin = origin))
        } catch (_: Exception) {
          throw ServiceActionException(ServiceActionError.PHONE_UNREACHABLE)
        }
      reply.context?.let(PhoneSession::receive)
      if (reply.status != WatchReply.Status.ACCEPTED) throw ServiceActionException(ServiceActionError.FAILED)
    }

  /**
   * Pauses the timer and saves whatever it holds as an entry for today, then resets it. The
   * phone works out the time when it handles the request.
   */
  suspend fun stopTimer(categoryId: String?, origin: WatchOrigin) =
    withContext(serial) {
      val template =
        WatchEntryDraft(id = newId(), date = dayKey(now()), hours = 0, minutes = 0, categoryId = categoryId, origin = origin)
      val request = WatchRequest(kind = WatchRequest.Kind.STOP_TIMER, id = template.id, entry = template, origin = origin)
      val reply =
        try {
          PhoneSession.send(request)
        } catch (_: Exception) {
          throw ServiceActionException(ServiceActionError.PHONE_UNREACHABLE)
        }
      reply.context?.let(PhoneSession::receive)
      when {
        reply.status == WatchReply.Status.ACCEPTED ->
          saveOutbox(outboxState.value + OutboxItem(request, System.currentTimeMillis(), delivered = true))
        reply.reason == WatchReply.Reason.TIMER_EMPTY -> throw ServiceActionException(ServiceActionError.TIMER_EMPTY)
        reply.reason == WatchReply.Reason.TIMER_TOO_LONG -> throw ServiceActionException(ServiceActionError.TIMER_TOO_LONG)
        else -> throw ServiceActionException(ServiceActionError.FAILED)
      }
    }

  /** Saves the paused timer's time as an entry and resets it, unless the timer changed since. */
  suspend fun saveTimer(hours: Int, minutes: Int, categoryId: String?) =
    withContext(serial) {
      val timer = timer ?: throw ServiceActionException(ServiceActionError.PHONE_UNREACHABLE)
      val entry =
        WatchEntryDraft(
          id = newId(),
          date = dayKey(now()),
          hours = hours,
          minutes = minutes,
          categoryId = categoryId,
          origin = WatchOrigin.TIMER,
        )
      val request =
        WatchRequest(
          kind = WatchRequest.Kind.SAVE_TIMER,
          id = entry.id,
          entry = entry,
          expectedTimerRevision = timer.revision,
          origin = WatchOrigin.TIMER,
        )
      val reply =
        try {
          PhoneSession.send(request)
        } catch (_: Exception) {
          throw ServiceActionException(ServiceActionError.PHONE_UNREACHABLE)
        }
      reply.context?.let(PhoneSession::receive)
      when {
        reply.status == WatchReply.Status.ACCEPTED ->
          saveOutbox(outboxState.value + OutboxItem(request, System.currentTimeMillis(), delivered = true))
        reply.reason == WatchReply.Reason.TIMER_CHANGED -> throw ServiceActionException(ServiceActionError.TIMER_CHANGED)
        else -> throw ServiceActionException(ServiceActionError.FAILED)
      }
    }

  /** The snapshot, when Add Time and the timer are available (Siri's `timeEntrySnapshot`). */
  fun timeEntrySnapshot(): WatchSnapshot {
    val snapshot = snapshot ?: throw ServiceActionException(ServiceActionError.NOT_SET_UP)
    if (!snapshot.showsTimeEntry) throw ServiceActionException(ServiceActionError.HOURS_LOGGING_OFF)
    return snapshot
  }

  // MARK: Helpers

  /** Complications and the tile add unsynced entries to the month's total, so they follow the outbox. */
  private fun saveOutbox(items: List<OutboxItem>) {
    outboxState.value = items
    WatchStorage.saveOutbox(items)
    Surfaces.update(appContext)
  }

  private fun newId() = UUID.randomUUID().toString().uppercase()

  fun show(error: Throwable) {
    alertKey.value = ((error as? ServiceActionException)?.error ?: ServiceActionError.FAILED).key
  }

  val isSyncing: Boolean
    get() = outboxState.value.isNotEmpty()
}
