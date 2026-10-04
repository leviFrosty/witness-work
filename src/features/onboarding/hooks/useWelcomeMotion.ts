import { useEffect } from 'react'
import { Platform } from 'react-native'
import {
  SensorType,
  SharedValue,
  clamp,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'

/** Device tilt for parallax, each axis roughly −1…1. */
export type Tilt = SharedValue<{ x: number; y: number }>

// iOS reports gravity pointing down; Android reports the opposite (up).
const DOWN = Platform.OS === 'ios' ? 1 : -1
// Device-tilt sensitivity: ~10° of tilt reaches about two-thirds of the range.
const TILT_GAIN = 4

/**
 * Drives the welcome scene while `running`: a clock in seconds, and the
 * device's tilt, smoothed, for parallax. Tilt is measured against a slowly
 * re-centring baseline, so the scene rests however the phone is held and only
 * responds to movement. Without a gravity sensor (e.g. a simulator) tilt simply
 * stays at rest.
 */
const useWelcomeMotion = (running: boolean) => {
  const time = useSharedValue(0)
  const tilt: Tilt = useSharedValue({ x: 0, y: 0 })
  const baseline = useSharedValue<{ x: number; y: number } | null>(null)
  const gravity = useAnimatedSensor(SensorType.GRAVITY)

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet'
    // Cap the step so a resume after a pause doesn't jump the scene.
    const dt = Math.min(timeSincePreviousFrame ?? 16, 64) / 1000
    time.value += dt

    const g = gravity.sensor.value
    if (g.x === 0 && g.y === 0 && g.z === 0) return
    const gx = (g.x * DOWN) / 9.81
    const gy = (g.y * DOWN) / 9.81
    const prev = baseline.value ?? { x: gx, y: gy }
    // Re-centre over a few seconds so a new grip becomes the new rest pose.
    const settle = Math.min(1, dt / 3)
    const base = {
      x: prev.x + (gx - prev.x) * settle,
      y: prev.y + (gy - prev.y) * settle,
    }
    baseline.value = base
    const target = {
      x: clamp((gx - base.x) * TILT_GAIN, -1, 1),
      y: clamp(-(gy - base.y) * TILT_GAIN, -1, 1),
    }
    // Ease toward the target so sensor noise never jitters the scene.
    const follow = Math.min(1, dt * 8)
    tilt.value = {
      x: tilt.value.x + (target.x - tilt.value.x) * follow,
      y: tilt.value.y + (target.y - tilt.value.y) * follow,
    }
  }, false)

  useEffect(() => {
    frame.setActive(running)
  }, [running, frame])

  return { time, tilt }
}

export default useWelcomeMotion
