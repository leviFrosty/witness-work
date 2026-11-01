import { Contact } from '@/types/contact'

export interface ContactMarker extends Contact {
  pinColor: string
}

export type MapRouteActions = {
  todayStopCount: number
  openTodayRoute: () => void
}
