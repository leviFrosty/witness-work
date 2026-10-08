package expo.modules.watchbridge

import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchEntryDraft
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchProtocol
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply.Reason
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply.Status
import com.leviwilkerson.witnesswork.watchprotocol.WatchRequest
import com.leviwilkerson.witnesswork.watchprotocol.WatchTimerAction

/** The phone's service timer, as the watch's requests need it. */
interface WatchTimer {
  fun snapshot(): TimerSnapshot

  fun start(): TimerSnapshot

  fun pause(): TimerSnapshot

  fun reset(): TimerSnapshot
}

/**
 * Handles one request from the watch against the inbox and the timer, as
 * `WatchSessionCoordinator.process` does on iOS. Pure apart from `persist` (returns whether
 * the inbox was stored) and `notifyJS`, so it runs in JVM tests. Wear OS has no Siri, so
 * nothing here records `siri_action_completed`.
 */
class WatchRequestHandler(
  private val inbox: () -> WatchInbox?,
  private val timer: WatchTimer,
  private val persist: () -> Boolean,
  private val notifyJS: () -> Unit,
  private val now: () -> Long = System::currentTimeMillis,
) {
  companion object {
    const val MAX_RESOLVED_IDS = 500
    const val MAX_CONTEXT_RESOLVED_IDS = 200
    const val MAX_HANDLED_REQUEST_IDS = 200
    const val MAX_EVENTS = 100
  }

  fun process(message: ByteArray): WatchReply {
    val request =
      WatchProtocol.decode(message, WatchRequest::fromJson)
        ?: return WatchReply(Status.REJECTED, Reason.INVALID, context = null)
    val inbox = inbox() ?: return WatchReply(Status.REJECTED, Reason.UNAVAILABLE, context = null)
    if (request.protocolVersion > WatchProtocol.VERSION) {
      return WatchReply(Status.REJECTED, Reason.UNSUPPORTED_VERSION, makeContext(inbox))
    }

    when (request.kind) {
      WatchRequest.Kind.HELLO -> {
        val complications = request.complications
        if (complications != null && complications != inbox.complications) {
          inbox.complications = complications
          persist()
        }
        return accepted(inbox)
      }

      WatchRequest.Kind.ADD_ENTRY -> {
        val entry = request.entry
        if (entry == null || entry.id != request.id) return invalid(inbox)
        return accept(inbox, entry)
      }

      WatchRequest.Kind.TIMER -> {
        val action = request.timerAction ?: return invalid(inbox)
        if (request.id !in inbox.handledRequestIds) {
          // Commands set a state rather than toggle, so one that crossed a change made on
          // the phone still leaves the timer as the user asked.
          if (action == WatchTimerAction.START) timer.start() else timer.pause()
          inbox.handledRequestIds.add(request.id)
          inbox.handledRequestIds = inbox.handledRequestIds.takeLast(MAX_HANDLED_REQUEST_IDS).toMutableList()
          recordEvent(
            inbox,
            "watch_timer_action_completed",
            mapOf(
              "action" to if (action == WatchTimerAction.START) "started" else "paused",
              "origin" to (request.origin ?: WatchOrigin.APP).raw,
            ),
          )
          persist()
        }
        return accepted(inbox)
      }

      WatchRequest.Kind.STOP_TIMER -> {
        val template = request.entry
        if (template == null || template.id != request.id) return invalid(inbox)
        if (isKnownEntry(inbox, template.id)) return accepted(inbox)
        val paused = timer.pause()
        val minutes = WatchEntryDraft.timerMinutes(paused.accumulatedMs)
        if (minutes >= WatchEntryDraft.MINUTES_RANGE.last + 1) {
          return WatchReply(Status.REJECTED, Reason.TIMER_TOO_LONG, makeContext(inbox))
        }
        if (minutes < WatchEntryDraft.MINUTES_RANGE.first) {
          return WatchReply(Status.REJECTED, Reason.TIMER_EMPTY, makeContext(inbox))
        }
        val entry = template.copy(hours = minutes / 60, minutes = minutes % 60)
        val reply = accept(inbox, entry)
        if (reply.status != Status.ACCEPTED) return reply
        timer.reset()
        return accepted(inbox)
      }

      WatchRequest.Kind.ADD_TRIP -> {
        val trip = request.trip
        if (trip == null || trip.id != request.id) return invalid(inbox)
        if (!isKnownEntry(inbox, trip.id)) {
          inbox.pendingTrips.add(WatchInbox.Pending(trip, now() / 1000.0))
          if (!persist()) {
            inbox.pendingTrips.removeAt(inbox.pendingTrips.lastIndex)
            return WatchReply(Status.REJECTED, Reason.UNAVAILABLE, context = null)
          }
          notifyJS()
        }
        return accepted(inbox)
      }

      WatchRequest.Kind.SAVE_TIMER -> {
        val entry = request.entry
        val expected = request.expectedTimerRevision
        if (entry == null || entry.id != request.id || expected == null) return invalid(inbox)
        if (isKnownEntry(inbox, entry.id)) return accepted(inbox)
        // The watch shows the time it saves; if the timer changed since, that time is out
        // of date and resetting would discard the difference.
        if (timer.snapshot().revision != expected) {
          return WatchReply(Status.REJECTED, Reason.TIMER_CHANGED, makeContext(inbox))
        }
        val reply = accept(inbox, entry)
        if (reply.status != Status.ACCEPTED) return reply
        timer.reset()
        return accepted(inbox)
      }
    }
  }

  fun makeContext(inbox: WatchInbox): PhoneContext =
    PhoneContext(
      sentAt = now() / 1000.0,
      snapshot = inbox.snapshot,
      timer = timer.snapshot(),
      resolvedEntryIds = inbox.resolvedEntryIds.takeLast(MAX_CONTEXT_RESOLVED_IDS),
    )

  /** An entry or trip with this id is waiting or was already handled. */
  fun isKnownEntry(inbox: WatchInbox, id: String): Boolean =
    inbox.pending.any { it.draft.id == id } ||
      inbox.pendingTrips.any { it.draft.id == id } ||
      id in inbox.resolvedEntryIds

  private fun accept(inbox: WatchInbox, entry: WatchEntryDraft): WatchReply {
    if (!isKnownEntry(inbox, entry.id)) {
      inbox.pending.add(WatchInbox.Pending(entry, now() / 1000.0))
      if (!persist()) {
        inbox.pending.removeAt(inbox.pending.lastIndex)
        return WatchReply(Status.REJECTED, Reason.UNAVAILABLE, context = null)
      }
      notifyJS()
    }
    return accepted(inbox)
  }

  private fun accepted(inbox: WatchInbox) = WatchReply(Status.ACCEPTED, context = makeContext(inbox))

  private fun invalid(inbox: WatchInbox) = WatchReply(Status.REJECTED, Reason.INVALID, makeContext(inbox))

  private fun recordEvent(inbox: WatchInbox, name: String, properties: Map<String, String>) {
    inbox.events.add(WatchInbox.Event(name, properties))
    inbox.events = inbox.events.takeLast(MAX_EVENTS).toMutableList()
    notifyJS()
  }
}
