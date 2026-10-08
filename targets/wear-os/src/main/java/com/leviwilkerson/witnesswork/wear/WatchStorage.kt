package com.leviwilkerson.witnesswork.wear

import android.content.Context
import com.leviwilkerson.witnesswork.watchprotocol.PhoneContext
import com.leviwilkerson.witnesswork.watchprotocol.WatchRequest
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

/** A request that changes data on the phone, kept until the phone app has handled its entry. */
data class OutboxItem(
  val request: WatchRequest,
  val createdAtMs: Long,
  /** The phone accepted it; it now only waits for the phone app to save it. */
  val delivered: Boolean,
) {
  val id: String
    get() = request.id

  fun toJson(): JSONObject =
    JSONObject().put("request", request.toJson()).put("createdAt", createdAtMs).put("delivered", delivered)

  companion object {
    fun fromJson(json: JSONObject) =
      OutboxItem(
        request = WatchRequest.fromJson(json.getJSONObject("request")),
        createdAtMs = json.getLong("createdAt"),
        delivered = json.getBoolean("delivered"),
      )
  }
}

/**
 * The watch's copy of what the phone published, plus its outbox, in the app's files directory.
 * The complications and the tile run in this process and read the same files. Like
 * `WatchStorage.swift`, `phone-context.json` holds the `PhoneContext` exactly as the phone sent
 * it, so `scripts/watch-fixture.mjs` output can be seeded on either watch.
 */
object WatchStorage {
  private const val CONTEXT_FILE = "phone-context.json"
  private const val OUTBOX_FILE = "outbox.json"

  private lateinit var directory: File

  fun init(context: Context) {
    if (!::directory.isInitialized) directory = context.applicationContext.filesDir
  }

  @Synchronized
  fun loadContext(): PhoneContext? = read(CONTEXT_FILE)?.let { runCatching { PhoneContext.fromJson(it) }.getOrNull() }

  /** Stores `context` unless a newer one is already stored. Returns whether it was stored. */
  @Synchronized
  fun saveContextIfNewer(context: PhoneContext): Boolean {
    val stored = loadContext()
    if (stored != null && stored.sentAt > context.sentAt) return false
    return write(CONTEXT_FILE, context.toJson().toString())
  }

  @Synchronized
  fun loadOutbox(): List<OutboxItem> =
    read(OUTBOX_FILE, array = true)?.let { json ->
      val array = json.getJSONArray("items")
      List(array.length()) { array.getJSONObject(it) }.mapNotNull { runCatching { OutboxItem.fromJson(it) }.getOrNull() }
    } ?: emptyList()

  @Synchronized
  fun saveOutbox(items: List<OutboxItem>) {
    write(OUTBOX_FILE, JSONArray(items.map { it.toJson() }).toString())
  }

  private fun read(name: String, array: Boolean = false): JSONObject? {
    if (!::directory.isInitialized) return null
    val file = File(directory, name)
    if (!file.exists()) return null
    return runCatching {
      val text = file.readText()
      if (array) JSONObject().put("items", JSONArray(text)) else JSONObject(text)
    }.getOrNull()
  }

  private fun write(name: String, text: String): Boolean {
    if (!::directory.isInitialized) return false
    return runCatching {
      val temporary = File(directory, "$name.tmp")
      temporary.writeText(text)
      temporary.renameTo(File(directory, name))
    }.getOrDefault(false)
  }
}

/** `YYYY-MM` of `date` in the Gregorian calendar, matching the phone's key. */
fun monthKey(date: ZonedDateTime): String = "%04d-%02d".format(date.year, date.monthValue)

/** `YYYY-MM-DD` of `date` in the Gregorian calendar. Watch entries carry this day. */
fun dayKey(date: ZonedDateTime): String = "%04d-%02d-%02d".format(date.year, date.monthValue, date.dayOfMonth)

/** False once the month the progress describes has ended, until the phone sends a new snapshot. */
fun WatchSnapshot.isCurrent(at: ZonedDateTime): Boolean = monthKey == monthKey(at)

/**
 * `reportedToday` becomes `reportedThisMonth` after the day the snapshot was built, so the
 * watch stays right overnight without the phone.
 */
fun WatchSnapshot.publisherState(at: ZonedDateTime): String {
  if (publisherState != "reportedToday") return publisherState
  val built = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(generatedAt.toLong()), at.zone)
  return if (built.toLocalDate() == at.toLocalDate()) publisherState else "reportedThisMonth"
}

fun now(): ZonedDateTime = ZonedDateTime.now(ZoneId.systemDefault())

fun ZonedDateTime.startOfDay(): ZonedDateTime = truncatedTo(ChronoUnit.DAYS)
