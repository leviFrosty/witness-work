/**
 * Pet choreography: entrances, tricks and the wake animation as pure time →
 * pose tables. See `types.ts` for the coordinate conventions.
 */
export { easeOut, lerp } from './ease'
export { ENTRANCES } from './entrances'
export { evaluateMotion } from './evaluate'
export { TRICKS } from './tricks'
export { REST_POSE } from './types'
export type { MotionFrame, MotionTable, Pose } from './types'
export { WAKE } from './wake'
export type { WakeTable } from './wake'
