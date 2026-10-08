package expo.modules.watchbridge

import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.TimerSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchEntryDraft
import com.leviwilkerson.witnesswork.watchprotocol.WatchOrigin
import com.leviwilkerson.witnesswork.watchprotocol.WatchProtocol
import com.leviwilkerson.witnesswork.watchprotocol.WatchReply
import com.leviwilkerson.witnesswork.watchprotocol.WatchRequest
import com.leviwilkerson.witnesswork.watchprotocol.WatchTimerAction
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** The phone's side of each request, as `WatchSessionCoordinator.swift` handles them. */
class WatchRequestHandlerTest {
  private class FakeTimer : WatchTimer {
    var isRunning = false
    var accumulatedMs = 0.0
    var revision = 0

    override fun snapshot() = TimerSnapshot(isRunning, if (isRunning) 1.0 else null, accumulatedMs, revision)

    override fun start() = apply { isRunning = true; revision++ }.snapshot()

    override fun pause() = apply { isRunning = false; revision++ }.snapshot()

    override fun reset() = apply { isRunning = false; accumulatedMs = 0.0; revision++ }.snapshot()
  }

  private lateinit var inbox: WatchInbox
  private lateinit var timer: FakeTimer
  private var stores = true
  private var notified = 0
  private lateinit var handler: WatchRequestHandler

  @Before
  fun setUp() {
    inbox = WatchInbox()
    timer = FakeTimer()
    stores = true
    notified = 0
    handler = WatchRequestHandler({ inbox }, timer, { stores }, { notified++ }, now = { 1_000_000L })
  }

  private fun entry(id: String = "E1", hours: Int = 1, minutes: Int = 30, origin: WatchOrigin = WatchOrigin.APP) =
    WatchEntryDraft(id = id, date = "2026-10-05", hours = hours, minutes = minutes, categoryId = null, origin = origin)

  private fun send(request: WatchRequest): WatchReply = handler.process(WatchProtocol.encode(request))

  @Test
  fun `stores a new entry for JS once, however often it's delivered`() {
    val request = WatchRequest(kind = WatchRequest.Kind.ADD_ENTRY, id = "E1", entry = entry(), origin = WatchOrigin.APP)
    assertEquals(WatchReply.Status.ACCEPTED, send(request).status)
    assertEquals(WatchReply.Status.ACCEPTED, send(request).status)
    assertEquals(listOf("E1"), inbox.pending.map { it.draft.id })
    assertEquals(1, notified)
  }

  @Test
  fun `refuses an entry whose id isn't the request's`() {
    val reply = send(WatchRequest(kind = WatchRequest.Kind.ADD_ENTRY, id = "other", entry = entry()))
    assertEquals(WatchReply.Reason.INVALID, reply.reason)
    assertTrue(inbox.pending.isEmpty())
  }

  @Test
  fun `asks the watch to retry when the inbox can't be stored`() {
    stores = false
    val reply = send(WatchRequest(kind = WatchRequest.Kind.ADD_ENTRY, id = "E1", entry = entry()))
    assertEquals(WatchReply.Reason.UNAVAILABLE, reply.reason)
    assertNull(reply.context)
    assertTrue(inbox.pending.isEmpty())
  }

  @Test
  fun `sets the timer once per request and records it for analytics`() {
    val start = WatchRequest(kind = WatchRequest.Kind.TIMER, id = "T1", timerAction = WatchTimerAction.START, origin = WatchOrigin.TILE)
    val reply = send(start)
    send(start)
    assertTrue(reply.context!!.timer.isRunning)
    assertEquals(1, timer.revision)
    assertEquals(
      listOf(WatchInbox.Event("watch_timer_action_completed", mapOf("action" to "started", "origin" to "tile"))),
      inbox.events,
    )
  }

  @Test
  fun `stops the timer into an entry of its whole minutes and resets it`() {
    timer.isRunning = true
    timer.accumulatedMs = 95.5 * 60_000
    val template = entry(id = "S1", hours = 0, minutes = 0, origin = WatchOrigin.ONGOING_ACTIVITY)
    val reply = send(WatchRequest(kind = WatchRequest.Kind.STOP_TIMER, id = "S1", entry = template))
    assertEquals(WatchReply.Status.ACCEPTED, reply.status)
    assertEquals(1 to 35, inbox.pending.single().draft.let { it.hours to it.minutes })
    assertEquals(0.0, timer.accumulatedMs, 0.0)
  }

  @Test
  fun `won't stop a timer with under a minute or 24 hours or more`() {
    timer.accumulatedMs = 59_000.0
    val empty = send(WatchRequest(kind = WatchRequest.Kind.STOP_TIMER, id = "S1", entry = entry(id = "S1")))
    assertEquals(WatchReply.Reason.TIMER_EMPTY, empty.reason)
    timer.accumulatedMs = 24 * 60 * 60_000.0
    val tooLong = send(WatchRequest(kind = WatchRequest.Kind.STOP_TIMER, id = "S2", entry = entry(id = "S2")))
    assertEquals(WatchReply.Reason.TIMER_TOO_LONG, tooLong.reason)
    assertTrue(inbox.pending.isEmpty())
    assertEquals(24 * 60 * 60_000.0, timer.accumulatedMs, 0.0)
  }

  @Test
  fun `saves the timer only if it hasn't changed since the watch showed it`() {
    timer.revision = 4
    val stale =
      send(WatchRequest(kind = WatchRequest.Kind.SAVE_TIMER, id = "V1", entry = entry(id = "V1"), expectedTimerRevision = 3))
    assertEquals(WatchReply.Reason.TIMER_CHANGED, stale.reason)
    val current =
      send(WatchRequest(kind = WatchRequest.Kind.SAVE_TIMER, id = "V2", entry = entry(id = "V2"), expectedTimerRevision = 4))
    assertEquals(WatchReply.Status.ACCEPTED, current.status)
    assertEquals(listOf("V2"), inbox.pending.map { it.draft.id })
    assertEquals(5, timer.revision)
  }

  @Test
  fun `keeps the complications the watch reports`() {
    send(WatchRequest(kind = WatchRequest.Kind.HELLO, complications = listOf("WitnessWorkProgress", "WitnessWorkTile")))
    assertEquals(listOf("WitnessWorkProgress", "WitnessWorkTile"), inbox.complications)
  }

  @Test
  fun `refuses a newer protocol it can't read`() {
    val reply = send(WatchRequest(kind = WatchRequest.Kind.HELLO, protocolVersion = WatchProtocol.VERSION + 1))
    assertEquals(WatchReply.Reason.UNSUPPORTED_VERSION, reply.reason)
    assertNotNull(reply.context)
  }

  @Test
  fun `refuses what isn't a request`() {
    assertEquals(WatchReply.Reason.INVALID, handler.process("nope".toByteArray()).reason)
  }

  @Test
  fun `reads a request written the way the Apple Watch writes it`() {
    // `JSONEncoder` output of `WatchRequest` in WatchProtocol.swift: optionals left out.
    val swift =
      """{"protocolVersion":1,"kind":"addEntry","id":"A1","origin":"app",
        |"entry":{"id":"A1","date":"2026-10-05","hours":2,"minutes":0,"origin":"app"}}""".trimMargin()
    assertEquals(WatchReply.Status.ACCEPTED, handler.process(swift.toByteArray()).status)
    assertNull(inbox.pending.single().draft.categoryId)
  }

  @Test
  fun `decodes the context JS builds, and writes it back the same`() {
    val json = javaClass.classLoader!!.getResource("phone-context.json")!!.readText()
    val context = PhoneContext.fromJson(JSONObject(json))
    assertEquals("2026-10", context.snapshot!!.monthKey)
    assertEquals(listOf("followUp", "plan"), context.snapshot!!.upNext!!.map { it.kind.raw })
    assertEquals(context, PhoneContext.fromJson(JSONObject(context.toJson().toString())))
  }

  @Test
  fun `keeps its inbox across a restart`() {
    send(WatchRequest(kind = WatchRequest.Kind.ADD_ENTRY, id = "E1", entry = entry()))
    send(WatchRequest(kind = WatchRequest.Kind.HELLO, complications = listOf("WitnessWorkUpNext")))
    assertEquals(inbox, WatchInbox.fromJson(JSONObject(inbox.toJson().toString())))
  }
}
