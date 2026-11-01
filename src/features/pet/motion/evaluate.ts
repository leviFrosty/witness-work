import {
  REST_POSE,
  type MotionFrame,
  type MotionTable,
  type Pose,
} from './types'

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
