package expo.modules.watchbridge

import com.leviwilkerson.witnesswork.watchprotocol.WatchEntryDraft
import com.leviwilkerson.witnesswork.watchprotocol.WatchSnapshot
import com.leviwilkerson.witnesswork.watchprotocol.WatchTripDraft
import org.json.JSONArray
import org.json.JSONObject

/**
 * Durable phone-side state of the watch connection, stored as JSON in the app's files
 * directory. Mirrors `WatchInbox` in `WatchSessionCoordinator.swift`; Android has no Siri,
 * so nothing else joins it.
 */
data class WatchInbox(
  /** Entries waiting for JS to save them as Time Entries. */
  val pending: MutableList<Pending<WatchEntryDraft>> = mutableListOf(),
  /** Trips waiting for JS to save them. */
  val pendingTrips: MutableList<Pending<WatchTripDraft>> = mutableListOf(),
  /** Entry and trip ids JS finished with, oldest first. */
  var resolvedEntryIds: MutableList<String> = mutableListOf(),
  /** Timer requests already applied, so a retried request is applied once. */
  var handledRequestIds: MutableList<String> = mutableListOf(),
  /** Analytics events for JS to capture; the watch can't reach analytics. */
  var events: MutableList<Event> = mutableListOf(),
  /** Latest snapshot built by JS, so the phone can answer the watch without starting JS. */
  var snapshot: WatchSnapshot? = null,
  /** Kinds of the complications and tile in use, as the watch last reported. */
  var complications: List<String>? = null,
) {
  data class Pending<T>(val draft: T, val receivedAt: Double)

  data class Event(val name: String, val properties: Map<String, String>)

  fun toJson(): JSONObject =
    JSONObject()
      .put(
        "pending",
        JSONArray(pending.map { JSONObject().put("draft", it.draft.toJson()).put("receivedAt", it.receivedAt) }),
      )
      .put(
        "pendingTrips",
        JSONArray(pendingTrips.map { JSONObject().put("draft", it.draft.toJson()).put("receivedAt", it.receivedAt) }),
      )
      .put("resolvedEntryIds", JSONArray(resolvedEntryIds))
      .put("handledRequestIds", JSONArray(handledRequestIds))
      .put(
        "events",
        JSONArray(events.map { JSONObject().put("name", it.name).put("properties", JSONObject(it.properties as Map<*, *>)) }),
      )
      .putOpt("snapshot", snapshot?.toJson())
      .putOpt("complications", complications?.let { JSONArray(it) })

  companion object {
    /** Fields added later are missing from older files. */
    fun fromJson(json: JSONObject): WatchInbox {
      fun objects(name: String) =
        json.optJSONArray(name)?.let { array -> List(array.length()) { array.getJSONObject(it) } }.orEmpty()
      fun strings(name: String) =
        json.optJSONArray(name)?.let { array -> MutableList(array.length()) { array.getString(it) } }
      return WatchInbox(
        pending =
          objects("pending")
            .map { Pending(WatchEntryDraft.fromJson(it.getJSONObject("draft")), it.getDouble("receivedAt")) }
            .toMutableList(),
        pendingTrips =
          objects("pendingTrips")
            .map { Pending(WatchTripDraft.fromJson(it.getJSONObject("draft")), it.getDouble("receivedAt")) }
            .toMutableList(),
        resolvedEntryIds = strings("resolvedEntryIds") ?: mutableListOf(),
        handledRequestIds = strings("handledRequestIds") ?: mutableListOf(),
        events =
          objects("events")
            .map { event ->
              val properties = event.getJSONObject("properties")
              Event(
                event.getString("name"),
                properties.keys().asSequence().associateWith { properties.getString(it) },
              )
            }
            .toMutableList(),
        snapshot = json.optJSONObject("snapshot")?.let(WatchSnapshot::fromJson),
        complications = strings("complications"),
      )
    }
  }
}
