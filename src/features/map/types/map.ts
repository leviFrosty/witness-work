import { Contact } from '@/types/contact'

export interface ContactMarker extends Contact {
  pinColor: string
}

/**
 * What the app lends the Map from route planning, which the map feature can't
 * reach on its own.
 */
export type MapRouteActions = {
  /** Stops on today's route; none hides the shortcut to it. */
  todayStopCount: number
  /**
   * Contacts already on today's route, which Plan Route doesn't add again or
   * count against the room left.
   */
  todayContactIds: ReadonlySet<string>
  openTodayRoute: () => void
  /** Opens today's route with these Contacts added as stops, in order. */
  planRoute: (contactIds: string[]) => void
  /** The most stops a route holds. */
  maxStops: number
  /** Route planning is unlocked. */
  supporter: boolean
}
