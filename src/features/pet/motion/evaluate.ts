import {
  REST_POSE,
  type MotionFrame,
  type MotionTable,
  type Pose,
} from './types'

/**
 * Evaluates `table` `elapsedMs` after it started: the full pose (unset fields
 * at rest), whether it's over, and whether its sound is due. A non-finite
 * elapsed time (a broken clock) ends the motion at its last pose, silently, so
 * it can't play forever.
 */
export function evaluateMotion(
  table: MotionTable,
  elapsedMs: number
): MotionFrame {
  if (!Number.isFinite(elapsedMs)) {
    const pose: Pose = { ...REST_POSE, ...table.pose(table.durationMs) }
    return { pose, done: true, sayDue: false }
  }
  const u = Math.max(0, elapsedMs)
  const pose: Pose = { ...REST_POSE, ...table.pose(u) }
  return { pose, done: u > table.durationMs, sayDue: u >= table.sayAtMs }
}
