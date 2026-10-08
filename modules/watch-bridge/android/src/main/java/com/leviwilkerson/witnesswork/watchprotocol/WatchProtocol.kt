package com.leviwilkerson.witnesswork.watchprotocol

import org.json.JSONArray
import org.json.JSONObject

// Messages exchanged between the Android phone app and the Wear OS app over the
// Wearable Data Layer: the same JSON the iPhone and the Apple Watch exchange
// over WatchConnectivity (`modules/watch-bridge/ios/WatchProtocol.swift`), so
// both watches show what `src/app/watch` builds.
//
// Canonical here and copied into `targets/wear-os` by
// `scripts/sync-widget-shared.mjs`. The phone is the source of truth: the watch
// sends `WatchRequest`s, and the phone answers with a `WatchReply` and
// publishes a `PhoneContext` describing everything the watch shows. Optional
// fields are left out when empty, as Swift's `Codable` does.

object WatchProtocol {
  /** Bump when a change would break an older counterpart. */
  const val VERSION = 1

  /** Phone → watch: the latest `PhoneContext`, as a data item. */
  const val CONTEXT_PATH = "/witnesswork/context"

  /** Watch → phone: a `WatchRequest` sent as an RPC, answered with a `WatchReply`. */
  const val REQUEST_PATH = "/witnesswork/request"

  /**
   * Watch → phone: a `WatchRequest` left as a data item (plus its id) for whenever the
   * phone is next connected, like `transferUserInfo` on watchOS.
   */
  const val QUEUED_PATH_PREFIX = "/witnesswork/queued/"

  /** Declared by the phone app in `res/values/wear.xml`. */
  const val PHONE_CAPABILITY = "witnesswork_phone_app"

  /** Declared by the Wear OS app in `res/values/wear.xml`. */
  const val WATCH_CAPABILITY = "witnesswork_wear_app"

  fun encode(value: JsonEncodable): ByteArray = value.toJson().toString().toByteArray(Charsets.UTF_8)

  fun <T> decode(bytes: ByteArray?, read: (JSONObject) -> T): T? {
    if (bytes == null) return null
    return try {
      read(JSONObject(String(bytes, Charsets.UTF_8)))
    } catch (_: Exception) {
      null
    }
  }
}

interface JsonEncodable {
  fun toJson(): JSONObject
}

/** Which surface created a request. Reported to analytics on the phone. */
enum class WatchOrigin(val raw: String) {
  APP("app"),

  /** Siri or Shortcuts on the Apple Watch. */
  SHORTCUT("shortcut"),
  TIMER("timer"),

  /** Siri or Shortcuts on the iPhone or iPad. */
  PHONE_SHORTCUT("phoneShortcut"),

  /** The Up Next screen, opened from the app or its complication. */
  UP_NEXT("up_next"),

  /** The Wear OS tile. Wear OS only. */
  TILE("tile"),

  /** The running timer's Ongoing Activity notification. Wear OS only. */
  ONGOING_ACTIVITY("ongoing_activity");

  companion object {
    fun from(raw: String?): WatchOrigin? = entries.firstOrNull { it.raw == raw }
  }
}

/**
 * A Time Entry created on the watch. `id` becomes the Time Entry's id on the phone, so a
 * request delivered more than once adds the entry only once.
 */
data class WatchEntryDraft(
  val id: String,
  /** Gregorian `YYYY-MM-DD` of the watch's local day when the entry was made. */
  val date: String,
  val hours: Int,
  val minutes: Int,
  val categoryId: String?,
  val origin: WatchOrigin,
) : JsonEncodable {
  override fun toJson(): JSONObject =
    JSONObject()
      .put("id", id)
      .put("date", date)
      .put("hours", hours)
      .put("minutes", minutes)
      .putOpt("categoryId", categoryId)
      .put("origin", origin.raw)

  companion object {
    /** Minutes one entry can hold, matching the phone's validation. */
    val MINUTES_RANGE = 1 until 24 * 60

    /** The timer's time as an entry: whole minutes, like the phone's Save Time. */
    fun timerMinutes(elapsedMs: Double): Int = (elapsedMs / 60_000).toInt()

    fun fromJson(json: JSONObject) =
      WatchEntryDraft(
        id = json.getString("id"),
        date = json.getString("date"),
        hours = json.getInt("hours"),
        minutes = json.getInt("minutes"),
        categoryId = json.optStringOrNull("categoryId"),
        origin = json.requireOrigin("origin"),
      )
  }
}

/** A mileage Trip. `id` becomes the Trip's id on the phone. */
data class WatchTripDraft(
  val id: String,
  val date: String,
  /** `null` uses the car the phone app picks for a new trip. */
  val vehicleId: String?,
  /** Total distance in miles, already doubled for a round trip. */
  val distanceMiles: Double,
  val roundTrip: Boolean,
  val origin: WatchOrigin,
) : JsonEncodable {
  override fun toJson(): JSONObject =
    JSONObject()
      .put("id", id)
      .put("date", date)
      .putOpt("vehicleId", vehicleId)
      .put("distanceMiles", distanceMiles)
      .put("roundTrip", roundTrip)
      .put("origin", origin.raw)

  companion object {
    fun fromJson(json: JSONObject) =
      WatchTripDraft(
        id = json.getString("id"),
        date = json.getString("date"),
        vehicleId = json.optStringOrNull("vehicleId"),
        distanceMiles = json.getDouble("distanceMiles"),
        roundTrip = json.getBoolean("roundTrip"),
        origin = json.requireOrigin("origin"),
      )
  }
}

enum class WatchTimerAction(val raw: String) {
  START("start"),
  PAUSE("pause");

  companion object {
    fun from(raw: String?): WatchTimerAction? = entries.firstOrNull { it.raw == raw }
  }
}

/** Watch → phone. */
data class WatchRequest(
  val kind: Kind,
  /** Unique per request and reused on retry. Equals `entry.id` or `trip.id` when there is one. */
  val id: String = java.util.UUID.randomUUID().toString().uppercase(),
  val entry: WatchEntryDraft? = null,
  val trip: WatchTripDraft? = null,
  val timerAction: WatchTimerAction? = null,
  /** For `SAVE_TIMER`: the timer revision the watch showed. */
  val expectedTimerRevision: Int? = null,
  val origin: WatchOrigin? = null,
  /** For `HELLO`: kinds of the complications (and the tile) in use, for analytics. */
  val complications: List<String>? = null,
  val protocolVersion: Int = WatchProtocol.VERSION,
) : JsonEncodable {
  enum class Kind(val raw: String) {
    /** Ask for a fresh `PhoneContext`. */
    HELLO("hello"),
    ADD_ENTRY("addEntry"),
    TIMER("timer"),

    /** Add the timer's time as an entry and reset the timer. */
    SAVE_TIMER("saveTimer"),

    /**
     * Pause the timer, add its whole minutes as an entry and reset it. `entry` gives the
     * id, day and Type; its time is ignored.
     */
    STOP_TIMER("stopTimer"),
    ADD_TRIP("addTrip");

    companion object {
      fun from(raw: String?): Kind? = entries.firstOrNull { it.raw == raw }
    }
  }

  override fun toJson(): JSONObject =
    JSONObject()
      .put("protocolVersion", protocolVersion)
      .put("kind", kind.raw)
      .put("id", id)
      .putOpt("entry", entry?.toJson())
      .putOpt("trip", trip?.toJson())
      .putOpt("timerAction", timerAction?.raw)
      .putOpt("expectedTimerRevision", expectedTimerRevision)
      .putOpt("origin", origin?.raw)
      .putOpt("complications", complications?.let { JSONArray(it) })

  companion object {
    fun fromJson(json: JSONObject) =
      WatchRequest(
        protocolVersion = json.getInt("protocolVersion"),
        kind = Kind.from(json.getString("kind")) ?: throw IllegalArgumentException("kind"),
        id = json.getString("id"),
        entry = json.optJSONObject("entry")?.let(WatchEntryDraft::fromJson),
        trip = json.optJSONObject("trip")?.let(WatchTripDraft::fromJson),
        timerAction =
          json.optStringOrNull("timerAction")?.let {
            WatchTimerAction.from(it) ?: throw IllegalArgumentException("timerAction")
          },
        expectedTimerRevision = json.optIntOrNull("expectedTimerRevision"),
        origin = json.optStringOrNull("origin")?.let { WatchOrigin.from(it) },
        complications = json.optJSONArray("complications")?.strings(),
      )
  }
}

/** Phone → watch, in answer to a `WatchRequest`. */
data class WatchReply(
  val status: Status,
  val reason: Reason? = null,
  val context: PhoneContext?,
) : JsonEncodable {
  enum class Status(val raw: String) {
    /** Durably received. The watch learns it was saved from `PhoneContext.resolvedEntryIds`. */
    ACCEPTED("accepted"),
    REJECTED("rejected"),
  }

  enum class Reason(val raw: String) {
    TIMER_CHANGED("timerChanged"),

    /** `stopTimer` found less than a minute on the timer. */
    TIMER_EMPTY("timerEmpty"),

    /** `stopTimer` found 24 hours or more, longer than any entry. */
    TIMER_TOO_LONG("timerTooLong"),
    UNSUPPORTED_VERSION("unsupportedVersion"),
    INVALID("invalid"),

    /** The phone couldn't store the request. */
    UNAVAILABLE("unavailable"),
  }

  override fun toJson(): JSONObject =
    JSONObject()
      .put("status", status.raw)
      .putOpt("reason", reason?.raw)
      .putOpt("context", context?.toJson())

  companion object {
    fun fromJson(json: JSONObject) =
      WatchReply(
        status =
          Status.entries.firstOrNull { it.raw == json.getString("status") }
            ?: throw IllegalArgumentException("status"),
        reason = json.optStringOrNull("reason")?.let { r -> Reason.entries.firstOrNull { it.raw == r } },
        context = json.optJSONObject("context")?.let(PhoneContext::fromJson),
      )
  }
}

/** The phone's service timer. */
data class TimerSnapshot(
  val isRunning: Boolean,
  /** Unix seconds when the running segment started; `null` while paused. */
  val startedAt: Double?,
  val accumulatedMs: Double,
  /** Advances on every change to the phone's timer. */
  val revision: Int,
) : JsonEncodable {
  fun elapsedMs(nowMs: Long = System.currentTimeMillis()): Double {
    if (isRunning && startedAt != null) {
      return accumulatedMs + maxOf(0.0, nowMs - startedAt * 1000)
    }
    return accumulatedMs
  }

  /** Epoch ms a counting-up clock starts from. */
  fun effectiveStartMs(nowMs: Long = System.currentTimeMillis()): Long =
    nowMs - elapsedMs(nowMs).toLong()

  override fun toJson(): JSONObject =
    JSONObject()
      .put("isRunning", isRunning)
      .putOpt("startedAt", startedAt)
      .put("accumulatedMs", accumulatedMs)
      .put("revision", revision)

  companion object {
    fun fromJson(json: JSONObject) =
      TimerSnapshot(
        isRunning = json.getBoolean("isRunning"),
        startedAt = json.optDoubleOrNull("startedAt"),
        accumulatedMs = json.getDouble("accumulatedMs"),
        revision = json.getInt("revision"),
      )
  }
}

/** A Follow-up or Plan for Up Next, built by `src/app/watch/buildUpNext.ts`. */
data class UpNextItem(
  /** Visit id, Day Plan id, or `<Recurring Plan id>:<YYYY-MM-DD>`. */
  val id: String,
  val kind: Kind,
  /** Epoch ms of the start; local midnight of its day when not `timed`. */
  val start: Double,
  /** False for a Plan without a start time, which spans its day. */
  val timed: Boolean,
  val title: String,
  val detail: String?,
  val durationText: String?,
  val timeText: String?,
  val clockText: String?,
  val periodText: String?,
  val weekdayText: String,
  val dateText: String,
  val place: Place?,
) : JsonEncodable {
  enum class Kind(val raw: String) {
    FOLLOW_UP("followUp"),
    PLAN("plan"),
  }

  /** Where Directions go. */
  data class Place(
    val name: String?,
    val address: String?,
    val latitude: Double?,
    val longitude: Double?,
  ) : JsonEncodable {
    override fun toJson(): JSONObject =
      JSONObject()
        .putOpt("name", name)
        .putOpt("address", address)
        .putOpt("latitude", latitude)
        .putOpt("longitude", longitude)

    companion object {
      fun fromJson(json: JSONObject) =
        Place(
          name = json.optStringOrNull("name"),
          address = json.optStringOrNull("address"),
          latitude = json.optDoubleOrNull("latitude"),
          longitude = json.optDoubleOrNull("longitude"),
        )
    }
  }

  val startMs: Long
    get() = start.toLong()

  override fun toJson(): JSONObject =
    JSONObject()
      .put("id", id)
      .put("kind", kind.raw)
      .put("start", start)
      .put("timed", timed)
      .put("title", title)
      .putOpt("detail", detail)
      .putOpt("durationText", durationText)
      .putOpt("timeText", timeText)
      .putOpt("clockText", clockText)
      .putOpt("periodText", periodText)
      .put("weekdayText", weekdayText)
      .put("dateText", dateText)
      .putOpt("place", place?.toJson())

  companion object {
    fun fromJson(json: JSONObject) =
      UpNextItem(
        id = json.getString("id"),
        kind =
          Kind.entries.firstOrNull { it.raw == json.getString("kind") }
            ?: throw IllegalArgumentException("kind"),
        start = json.getDouble("start"),
        timed = json.getBoolean("timed"),
        title = json.getString("title"),
        detail = json.optStringOrNull("detail"),
        durationText = json.optStringOrNull("durationText"),
        timeText = json.optStringOrNull("timeText"),
        clockText = json.optStringOrNull("clockText"),
        periodText = json.optStringOrNull("periodText"),
        weekdayText = json.getString("weekdayText"),
        dateText = json.getString("dateText"),
        place = json.optJSONObject("place")?.let(Place::fromJson),
      )
  }
}

/**
 * What the watch shows, built by the phone app's JS (`src/app/watch`). Display strings arrive
 * translated into the app's language and durations arrive formatted. Mirrors `WatchSnapshot`
 * in `WatchProtocol.swift`, including which fields are optional.
 */
data class WatchSnapshot(
  val version: Int,
  /** Epoch ms. */
  val generatedAt: Double,
  /** `YYYY-MM` of the phone's month when built. */
  val monthKey: String,
  /** Add Time and the timer are available (hours-mode role or Hours Logging). */
  val showsTimeEntry: Boolean,
  /** `hours` or `checkbox`. */
  val entryMode: String,
  val monthFormatted: String,
  /** Single-token duration for complications, e.g. `12.5h`; `0h` for zero. */
  val monthCompact: String,
  /** Credit-capped minutes this month. */
  val monthMinutes: Int?,
  val monthName: String?,
  /** Whole hours; 0 means no goal. */
  val goalHours: Int,
  /** 0...1 toward the monthly goal. */
  val progress: Double,
  /** Planned minutes through each day of the month; `null` without plans. */
  val plannedThroughDay: List<Int>?,
  /** `unreported`, `reportedToday` or `reportedThisMonth`. */
  val publisherState: String,
  val paceText: String?,
  val nextMonth: NextMonth?,
  val reflectedEntryIds: List<String>?,
  val upNext: List<UpNextItem>?,
  val categories: List<Category>,
  val mileage: Mileage?,
  val strings: Map<String, String>,
) : JsonEncodable {
  data class Category(val id: String, val name: String, val isCredit: Boolean?) : JsonEncodable {
    override fun toJson(): JSONObject =
      JSONObject().put("id", id).put("name", name).putOpt("isCredit", isCredit)

    companion object {
      fun fromJson(json: JSONObject) =
        Category(
          id = json.getString("id"),
          name = json.getString("name"),
          isCredit = json.optBooleanOrNull("isCredit"),
        )
    }
  }

  data class NextMonth(
    val monthKey: String,
    val monthName: String,
    val goalHours: Int,
    val showsTimeEntry: Boolean,
  ) : JsonEncodable {
    override fun toJson(): JSONObject =
      JSONObject()
        .put("monthKey", monthKey)
        .put("monthName", monthName)
        .put("goalHours", goalHours)
        .put("showsTimeEntry", showsTimeEntry)

    companion object {
      fun fromJson(json: JSONObject) =
        NextMonth(
          monthKey = json.getString("monthKey"),
          monthName = json.getString("monthName"),
          goalHours = json.getInt("goalHours"),
          showsTimeEntry = json.getBoolean("showsTimeEntry"),
        )
    }
  }

  data class Mileage(
    val enabled: Boolean,
    /** `mi` or `km`. */
    val distanceUnit: String,
    val vehicles: List<Vehicle>,
  ) : JsonEncodable {
    data class Vehicle(val id: String, val name: String) : JsonEncodable {
      override fun toJson(): JSONObject = JSONObject().put("id", id).put("name", name)
    }

    override fun toJson(): JSONObject =
      JSONObject()
        .put("enabled", enabled)
        .put("distanceUnit", distanceUnit)
        .put("vehicles", JSONArray(vehicles.map { it.toJson() }))

    companion object {
      fun fromJson(json: JSONObject) =
        Mileage(
          enabled = json.getBoolean("enabled"),
          distanceUnit = json.getString("distanceUnit"),
          vehicles =
            json.getJSONArray("vehicles").objects().map {
              Vehicle(it.getString("id"), it.getString("name"))
            },
        )
    }
  }

  override fun toJson(): JSONObject =
    JSONObject()
      .put("version", version)
      .put("generatedAt", generatedAt)
      .put("monthKey", monthKey)
      .put("showsTimeEntry", showsTimeEntry)
      .put("entryMode", entryMode)
      .put("monthFormatted", monthFormatted)
      .put("monthCompact", monthCompact)
      .putOpt("monthMinutes", monthMinutes)
      .putOpt("monthName", monthName)
      .put("goalHours", goalHours)
      .put("progress", progress)
      .putOpt("plannedThroughDay", plannedThroughDay?.let { JSONArray(it) })
      .put("publisherState", publisherState)
      .putOpt("paceText", paceText)
      .putOpt("nextMonth", nextMonth?.toJson())
      .putOpt("reflectedEntryIds", reflectedEntryIds?.let { JSONArray(it) })
      .putOpt("upNext", upNext?.let { items -> JSONArray(items.map { it.toJson() }) })
      .put("categories", JSONArray(categories.map { it.toJson() }))
      .putOpt("mileage", mileage?.toJson())
      .put("strings", JSONObject(strings as Map<*, *>))

  companion object {
    const val SUPPORTED_VERSION = 1

    fun fromJson(json: JSONObject): WatchSnapshot {
      val strings = json.getJSONObject("strings")
      return WatchSnapshot(
        version = json.getInt("version"),
        generatedAt = json.getDouble("generatedAt"),
        monthKey = json.getString("monthKey"),
        showsTimeEntry = json.getBoolean("showsTimeEntry"),
        entryMode = json.getString("entryMode"),
        monthFormatted = json.getString("monthFormatted"),
        monthCompact = json.getString("monthCompact"),
        monthMinutes = json.optIntOrNull("monthMinutes"),
        monthName = json.optStringOrNull("monthName"),
        goalHours = json.getInt("goalHours"),
        progress = json.getDouble("progress"),
        plannedThroughDay =
          json.optJSONArray("plannedThroughDay")?.let { a -> List(a.length()) { a.getInt(it) } },
        publisherState = json.getString("publisherState"),
        paceText = json.optStringOrNull("paceText"),
        nextMonth = json.optJSONObject("nextMonth")?.let(NextMonth::fromJson),
        reflectedEntryIds = json.optJSONArray("reflectedEntryIds")?.strings(),
        upNext = json.optJSONArray("upNext")?.objects()?.map(UpNextItem::fromJson),
        categories = json.getJSONArray("categories").objects().map(Category::fromJson),
        mileage = json.optJSONObject("mileage")?.let(Mileage::fromJson),
        strings = strings.keys().asSequence().associateWith { strings.getString(it) },
      )
    }
  }
}

/** Phone → watch: published as a data item, and returned with every reply. */
data class PhoneContext(
  /** Unix seconds. Also makes each published context distinct. */
  val sentAt: Double,
  /** `null` until the phone app has run since the watch app was installed. */
  val snapshot: WatchSnapshot?,
  val timer: TimerSnapshot,
  /** Watch entry ids the phone app has finished with (saved or refused), oldest first. */
  val resolvedEntryIds: List<String>,
  val protocolVersion: Int = WatchProtocol.VERSION,
) : JsonEncodable {
  override fun toJson(): JSONObject =
    JSONObject()
      .put("protocolVersion", protocolVersion)
      .put("sentAt", sentAt)
      .putOpt("snapshot", snapshot?.toJson())
      .put("timer", timer.toJson())
      .put("resolvedEntryIds", JSONArray(resolvedEntryIds))

  companion object {
    fun fromJson(json: JSONObject) =
      PhoneContext(
        protocolVersion = json.getInt("protocolVersion"),
        sentAt = json.getDouble("sentAt"),
        snapshot = json.optJSONObject("snapshot")?.let(WatchSnapshot::fromJson),
        timer = TimerSnapshot.fromJson(json.getJSONObject("timer")),
        resolvedEntryIds = json.getJSONArray("resolvedEntryIds").strings(),
      )
  }
}

// MARK: JSON helpers

internal fun JSONObject.optStringOrNull(name: String): String? =
  if (has(name) && !isNull(name)) getString(name) else null

internal fun JSONObject.optIntOrNull(name: String): Int? =
  if (has(name) && !isNull(name)) getInt(name) else null

internal fun JSONObject.optDoubleOrNull(name: String): Double? =
  if (has(name) && !isNull(name)) getDouble(name) else null

internal fun JSONObject.optBooleanOrNull(name: String): Boolean? =
  if (has(name) && !isNull(name)) getBoolean(name) else null

internal fun JSONObject.requireOrigin(name: String): WatchOrigin =
  WatchOrigin.from(getString(name)) ?: throw IllegalArgumentException(name)

internal fun JSONArray.strings(): List<String> = List(length()) { getString(it) }

internal fun JSONArray.objects(): List<JSONObject> = List(length()) { getJSONObject(it) }
