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
  openTodayRoute: () => void
}
