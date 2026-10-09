package expo.modules.watchbridge

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS side of the Wear OS watch connection, with the same API as the iOS module. See
 * `WatchSessionCoordinator` and `src/app/watch/watchSync.ts`.
 */
class WatchBridgeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val coordinator
    get() = WatchSessionCoordinator.get(context)

  private val onInbox: () -> Unit = { sendEvent("onInboxChange", emptyMap<String, Any>()) }
  private val onStatus: () -> Unit = { sendEvent("onStatusChange", emptyMap<String, Any>()) }

  override fun definition() = ModuleDefinition {
    Name("WatchBridge")

    Events("onInboxChange", "onStatusChange")

    OnCreate {
      // Creating the coordinator checks the status; JS asks again when it starts listening.
      coordinator.addInboxListener(onInbox)
      coordinator.addStatusListener(onStatus)
    }

    // The first status can arrive before JS listens; JS sends the watch its snapshot on it.
    OnStartObserving("onStatusChange") { coordinator.refreshStatus(announce = true) }

    OnDestroy {
      coordinator.removeInboxListener(onInbox)
      coordinator.removeStatusListener(onStatus)
    }

    Function("getStatus") {
      val status = coordinator.status()
      val active = coordinator.activeComplications()
      mapOf(
        "isSupported" to status.isSupported,
        "isPaired" to status.isPaired,
        "isWatchAppInstalled" to status.isWatchAppInstalled,
        "isComplicationEnabled" to
          (status.isWatchAppInstalled && active.orEmpty().any { it != WatchSessionCoordinator.TILE_KIND }),
        "activeComplications" to active,
      )
    }

    Function("setSnapshot") { json: String, urgent: Boolean? -> coordinator.setSnapshot(json, urgent ?: true) }

    Function("getPendingEntries") {
      coordinator.pendingEntries().map { entry ->
        mapOf(
          "id" to entry.id,
          "date" to entry.date,
          "hours" to entry.hours,
          "minutes" to entry.minutes,
          "categoryId" to entry.categoryId,
          "origin" to entry.origin.raw,
        )
      }
    }

    Function("getPendingTrips") {
      coordinator.pendingTrips().map { trip ->
        mapOf(
          "id" to trip.id,
          "date" to trip.date,
          "vehicleId" to trip.vehicleId,
          "distanceMiles" to trip.distanceMiles,
          "roundTrip" to trip.roundTrip,
          "origin" to trip.origin.raw,
        )
      }
    }

    Function("resolveEntries") { ids: List<String> -> coordinator.resolveEntries(ids) }

    Function("takeErrors") { coordinator.takeErrors() }

    Function("takeEvents") {
      coordinator.takeEvents().map { event -> mapOf("name" to event.name, "properties" to event.properties) }
    }
  }
}
