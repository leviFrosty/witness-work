package expo.modules.calendarbridge

import android.Manifest
import android.content.ContentProviderOperation
import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Events
import android.provider.CalendarContract.Reminders
import android.provider.CalendarContract.AUTHORITY
import android.provider.CalendarContract.CALLER_IS_SYNCADAPTER
import android.provider.CalendarContract.ACCOUNT_TYPE_LOCAL
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.TimeZone

/** The code doubles as the message, so the JS classifier works either way. */
class CalendarFailure(code: String) : CodedException(code, code, null)

/** One event to write. Without an `id`, a new event is inserted. */
class EventWrite : Record {
  @Field val id: String? = null
  @Field val title: String = ""
  @Field val start: Double = 0.0
  @Field val end: Double = 0.0
  @Field val location: String = ""
  @Field val description: String = ""
  /** Minutes before `start`; null means no alert. */
  @Field val alertMinutes: Int? = null
  /** Replace the event's reminders with `alertMinutes`. */
  @Field val resetAlert: Boolean = false
}

/**
 * CalendarContract adapter for Android Calendar Sync. Single device, no
 * ownership protocol: JavaScript decides what to write (see
 * `src/app/calendar/androidEvents.ts`), and every call here is scoped to one
 * destination calendar. WitnessWork events are found by the marker link in
 * their description, which every provider (including Google) syncs, so
 * publishing upserts by Follow-up instead of creating blindly.
 */
class CalendarBridgeModule : Module() {
  private val resolver: ContentResolver
    get() = (appContext.reactContext ?: throw Exceptions.ReactContextLost()).contentResolver

  private val lock = Any()

  override fun definition() = ModuleDefinition {
    Name("CalendarBridge")

    AsyncFunction("requestAccess") { promise: Promise ->
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      permissions.askForPermissions(
        { result -> promise.resolve(result.values.all { it.status == PermissionsStatus.GRANTED }) },
        Manifest.permission.READ_CALENDAR,
        Manifest.permission.WRITE_CALENDAR,
      )
    }

    AsyncFunction("destinations") {
      guarded { destinations() }
    }

    AsyncFunction("createCalendar") { title: String ->
      guarded { createCalendar(title) }
    }

    AsyncFunction("events") { calendarId: String ->
      guarded { events(calendar(calendarId)) }
    }

    AsyncFunction("apply") { calendarId: String, writes: List<EventWrite>, deletes: List<String> ->
      guarded { applyChanges(calendar(calendarId), writes, deletes) }
    }
  }

  private fun <T> guarded(action: () -> T): T = synchronized(lock) {
    requireAccess()
    try {
      action()
    } catch (error: CodedException) {
      throw error
    } catch (error: SecurityException) {
      throw CalendarFailure("CALENDAR_PERMISSION")
    } catch (error: Exception) {
      throw CalendarFailure("CALENDAR_UNAVAILABLE")
    }
  }

  private fun requireAccess() {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val granted = listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR).all {
      context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED
    }
    if (!granted) throw CalendarFailure("CALENDAR_PERMISSION")
  }

  /**
   * Writable, synced calendars. An account's primary calendar is excluded, as
   * on iOS: pick or create one used only for WitnessWork.
   */
  private fun destinations(): List<Map<String, Any>> {
    val result = mutableListOf<Map<String, Any>>()
    resolver.query(
      Calendars.CONTENT_URI,
      CALENDAR_COLUMNS,
      "${Calendars.CALENDAR_ACCESS_LEVEL} >= ? AND ${Calendars.SYNC_EVENTS} = 1",
      arrayOf(Calendars.CAL_ACCESS_CONTRIBUTOR.toString()),
      "${Calendars.ACCOUNT_NAME}, ${Calendars.CALENDAR_DISPLAY_NAME}",
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        if (cursor.int(Calendars.IS_PRIMARY) == 1) continue
        result.add(describe(cursor))
      }
    }
    return result
  }

  /**
   * Google and most other accounts don't accept calendars created on the
   * device, so new calendars are local. Reuses the one created earlier rather
   * than adding a second.
   */
  private fun createCalendar(title: String): Map<String, Any> {
    findLocalCalendar()?.let { return it }
    val uri = Calendars.CONTENT_URI.buildUpon()
      .appendQueryParameter(CALLER_IS_SYNCADAPTER, "true")
      .appendQueryParameter(Calendars.ACCOUNT_NAME, LOCAL_ACCOUNT)
      .appendQueryParameter(Calendars.ACCOUNT_TYPE, ACCOUNT_TYPE_LOCAL)
      .build()
    val values = ContentValues().apply {
      put(Calendars.ACCOUNT_NAME, LOCAL_ACCOUNT)
      put(Calendars.ACCOUNT_TYPE, ACCOUNT_TYPE_LOCAL)
      put(Calendars.NAME, LOCAL_CALENDAR_NAME)
      put(Calendars.CALENDAR_DISPLAY_NAME, title)
      put(Calendars.CALENDAR_COLOR, CALENDAR_COLOR)
      put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER)
      put(Calendars.OWNER_ACCOUNT, LOCAL_ACCOUNT)
      put(Calendars.IS_PRIMARY, 0)
      put(Calendars.VISIBLE, 1)
      put(Calendars.SYNC_EVENTS, 1)
      put(Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().id)
    }
    resolver.insert(uri, values) ?: throw CalendarFailure("CALENDAR_CREATE_FAILED")
    return findLocalCalendar() ?: throw CalendarFailure("CALENDAR_CREATE_FAILED")
  }

  private fun findLocalCalendar(): Map<String, Any>? =
    resolver.query(
      Calendars.CONTENT_URI,
      CALENDAR_COLUMNS,
      "${Calendars.ACCOUNT_TYPE} = ? AND ${Calendars.ACCOUNT_NAME} = ? AND ${Calendars.NAME} = ?",
      arrayOf(ACCOUNT_TYPE_LOCAL, LOCAL_ACCOUNT, LOCAL_CALENDAR_NAME),
      "${Calendars._ID}",
    )?.use { cursor -> if (cursor.moveToFirst()) describe(cursor) else null }

  private fun describe(cursor: Cursor): Map<String, Any> = mapOf(
    "id" to cursor.long(Calendars._ID).toString(),
    "title" to cursor.string(Calendars.CALENDAR_DISPLAY_NAME),
    "account" to cursor.string(Calendars.ACCOUNT_NAME),
    "local" to (cursor.string(Calendars.ACCOUNT_TYPE) == ACCOUNT_TYPE_LOCAL),
  )

  /** A missing, hidden-from-sync or read-only calendar pauses publishing. */
  private fun calendar(calendarId: String): Long {
    val id = calendarId.toLongOrNull() ?: throw CalendarFailure("CALENDAR_MISSING")
    val writable = resolver.query(
      ContentUris.withAppendedId(Calendars.CONTENT_URI, id),
      arrayOf(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.SYNC_EVENTS),
      null,
      null,
      null,
    )?.use { cursor ->
      cursor.moveToFirst() &&
        cursor.int(Calendars.CALENDAR_ACCESS_LEVEL) >= Calendars.CAL_ACCESS_CONTRIBUTOR &&
        cursor.int(Calendars.SYNC_EVENTS) == 1
    } ?: false
    if (!writable) throw CalendarFailure("CALENDAR_MISSING")
    return id
  }

  /**
   * Events in the calendar that carry the WitnessWork marker. Recurring events
   * and their exceptions are left alone: WitnessWork only writes single events.
   */
  private fun events(calendarId: Long): List<Map<String, Any?>> {
    val result = mutableListOf<Map<String, Any?>>()
    resolver.query(
      Events.CONTENT_URI,
      EVENT_COLUMNS,
      "${Events.CALENDAR_ID} = ? AND ${Events.DELETED} = 0 AND ${Events.RRULE} IS NULL AND " +
        "${Events.ORIGINAL_ID} IS NULL AND ${Events.DESCRIPTION} LIKE ?",
      arrayOf(calendarId.toString(), "%$MARKER%"),
      null,
    )?.use { cursor ->
      while (cursor.moveToNext()) {
        result.add(
          mapOf(
            "id" to cursor.long(Events._ID).toString(),
            "syncId" to cursor.stringOrNull(Events._SYNC_ID),
            "title" to cursor.string(Events.TITLE),
            "start" to cursor.long(Events.DTSTART).toDouble(),
            "end" to cursor.long(Events.DTEND).toDouble(),
            "location" to cursor.string(Events.EVENT_LOCATION),
            "description" to cursor.string(Events.DESCRIPTION),
            "allDay" to (cursor.int(Events.ALL_DAY) == 1),
          ),
        )
      }
    }
    return result
  }

  /**
   * One provider transaction. Updates and deletes only touch WitnessWork
   * events in this calendar, whatever ids JavaScript sends.
   */
  private fun applyChanges(calendarId: Long, writes: List<EventWrite>, deletes: List<String>) {
    val requested = (writes.mapNotNull { it.id } + deletes).mapNotNull { it.toLongOrNull() }
    val owned = ownedIds(calendarId, requested)
    val resetIds = writes.filter { it.resetAlert }.mapNotNull { it.id?.toLongOrNull() }.filter { it in owned }
    val reminders = reminderIds(resetIds)
    val operations = ArrayList<ContentProviderOperation>()
    for (id in deletes.mapNotNull { it.toLongOrNull() }.filter { it in owned }) {
      operations.add(ContentProviderOperation.newDelete(ContentUris.withAppendedId(Events.CONTENT_URI, id)).build())
    }
    for (write in writes) {
      if (!(write.start.isFinite() && write.end.isFinite() && write.end > write.start)) {
        throw CalendarFailure("CALENDAR_INVALID_DATE")
      }
      val values = eventValues(write)
      val existing = write.id?.toLongOrNull()
      if (write.id == null) {
        values.put(Events.CALENDAR_ID, calendarId)
        val index = operations.size
        operations.add(ContentProviderOperation.newInsert(Events.CONTENT_URI).withValues(values).build())
        write.alertMinutes?.let {
          operations.add(
            reminder(it).withValueBackReference(Reminders.EVENT_ID, index).build(),
          )
        }
      } else if (existing != null && existing in owned) {
        operations.add(
          ContentProviderOperation.newUpdate(ContentUris.withAppendedId(Events.CONTENT_URI, existing))
            .withValues(values)
            .build(),
        )
        if (!write.resetAlert) continue
        for (reminderId in reminders[existing].orEmpty()) {
          operations.add(
            ContentProviderOperation.newDelete(ContentUris.withAppendedId(Reminders.CONTENT_URI, reminderId)).build(),
          )
        }
        write.alertMinutes?.let {
          operations.add(reminder(it).withValue(Reminders.EVENT_ID, existing).build())
        }
      }
    }
    if (operations.isNotEmpty()) resolver.applyBatch(AUTHORITY, operations)
  }

  private fun eventValues(write: EventWrite) = ContentValues().apply {
    put(Events.TITLE, write.title)
    put(Events.DTSTART, write.start.toLong())
    put(Events.DTEND, write.end.toLong())
    put(Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
    put(Events.ALL_DAY, 0)
    if (write.location.isEmpty()) putNull(Events.EVENT_LOCATION) else put(Events.EVENT_LOCATION, write.location)
    put(Events.DESCRIPTION, write.description)
  }

  private fun reminder(minutes: Int) = ContentProviderOperation.newInsert(Reminders.CONTENT_URI)
    .withValue(Reminders.MINUTES, minutes)
    .withValue(Reminders.METHOD, Reminders.METHOD_ALERT)

  private fun ownedIds(calendarId: Long, ids: List<Long>): Set<Long> {
    if (ids.isEmpty()) return emptySet()
    val owned = mutableSetOf<Long>()
    for (chunk in ids.distinct().chunked(QUERY_CHUNK)) {
      resolver.query(
        Events.CONTENT_URI,
        arrayOf(Events._ID),
        "${Events.CALENDAR_ID} = ? AND ${Events.DESCRIPTION} LIKE ? AND ${Events._ID} IN (${chunk.joinToString(",")})",
        arrayOf(calendarId.toString(), "%$MARKER%"),
        null,
      )?.use { cursor -> while (cursor.moveToNext()) owned.add(cursor.long(Events._ID)) }
    }
    return owned
  }

  private fun reminderIds(eventIds: List<Long>): Map<Long, List<Long>> {
    val result = mutableMapOf<Long, MutableList<Long>>()
    for (chunk in eventIds.chunked(QUERY_CHUNK)) {
      resolver.query(
        Reminders.CONTENT_URI,
        arrayOf(Reminders._ID, Reminders.EVENT_ID),
        "${Reminders.EVENT_ID} IN (${chunk.joinToString(",")})",
        null,
        null,
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          result.getOrPut(cursor.long(Reminders.EVENT_ID)) { mutableListOf() }.add(cursor.long(Reminders._ID))
        }
      }
    }
    return result
  }

  private fun Cursor.index(column: String) = getColumnIndexOrThrow(column)
  private fun Cursor.long(column: String) = getLong(index(column))
  private fun Cursor.int(column: String) = getInt(index(column))
  private fun Cursor.string(column: String) = getString(index(column)) ?: ""
  private fun Cursor.stringOrNull(column: String): String? = getString(index(column))

  private companion object {
    const val MARKER = "witnesswork://contact/"
    const val LOCAL_ACCOUNT = "WitnessWork"
    const val LOCAL_CALENDAR_NAME = "witnesswork"
    /** Matches iOS's system teal. */
    val CALENDAR_COLOR = 0xFF30B0C7.toInt()
    const val QUERY_CHUNK = 500
    val CALENDAR_COLUMNS = arrayOf(
      Calendars._ID,
      Calendars.CALENDAR_DISPLAY_NAME,
      Calendars.ACCOUNT_NAME,
      Calendars.ACCOUNT_TYPE,
      Calendars.IS_PRIMARY,
    )
    val EVENT_COLUMNS = arrayOf(
      Events._ID,
      Events._SYNC_ID,
      Events.TITLE,
      Events.DTSTART,
      Events.DTEND,
      Events.EVENT_LOCATION,
      Events.DESCRIPTION,
      Events.ALL_DAY,
    )
  }
}
