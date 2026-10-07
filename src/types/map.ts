export const mapLayers = ['standard', 'satellite', 'hybrid'] as const

/** Base imagery the Map draws under contacts. */
export type MapLayer = (typeof mapLayers)[number]
