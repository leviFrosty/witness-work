export const mapLayers = ['standard', 'satellite', 'hybrid'] as const

/** Base imagery the Map draws under contacts. */
export type MapLayer = (typeof mapLayers)[number]

/**
 * What the line over a Contact's name on its map card shows. `nextVisit` picks
 * the most useful of an overdue or upcoming Follow-up, else the last visit.
 * `field:<id>` shows that Custom Field's value.
 */
export type MapCardDetail =
  | 'nextVisit'
  | 'lastVisit'
  | 'followUpTopic'
  | 'nameOnly'
  | `field:${string}`
