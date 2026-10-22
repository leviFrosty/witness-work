/**
 * Pet art: species sprites, the room, lighting, particles and the scene
 * composer, all pure TypeScript on top of `@/lib/pixelArt`.
 *
 * Coordinates: a 180 × 100 scene (see `layout.ts`) with 32 × 32 pet sprites
 * resting at (52, 52).
 */
export * from './hats'
export * from './hearts'
export * from './layout'
export * as particles from './particles'
export type { Dust, Particle, ParticleKind, ParticleState } from './particles'
export * from './player'
export * from './room'
export * from './scene'
export * from './silhouette'
export * from './species'
export * from './sprite'
export * from './types'
export { drawParadiseWalkers, drawShootingStar } from './windowExtras'
export { applyLighting, lightPhase, LIGHT_PHASES } from './lighting'
