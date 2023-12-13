export type HereGeocodeResponse = {
  items: GeocodeItem[]
}

type GeocodeItem = {
  id: string
  title: string
  position?: {
    lat: number
    lng: number
  }
}
