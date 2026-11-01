export const mapLayers = ['standard', 'satellite', 'hybrid'] as const

export type MapLayer = (typeof mapLayers)[number]

export type MapCardDetail =
  | 'nextVisit'
  | 'lastVisit'
  | 'followUpTopic'
  | 'nameOnly'
  | `field:${string}`
