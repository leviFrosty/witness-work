import { useEffect, useState } from 'react'
import { AppState, Platform, type AppStateStatus } from 'react-native'
import {
  SensorType,
  SharedValue,
  clamp,
  useAnimatedSensor,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated'

export type Tilt = SharedValue<{ x: number; y: number }>

const DOWN = Platform.OS === 'ios' ? 1 : -1

const TILT_GAIN = 4

export const runsInAppState = (state: AppStateStatus): boolean =>
  state !== 'background'

const useWelcomeMotion = (running: boolean) => {
  const [appRuns, setAppRuns] = useState(() =>
    runsInAppState(AppState.currentState)
  )
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setAppRuns(runsInAppState(state))
    )
    return () => subscription.remove()
  }, [])

  const time = useSharedValue(0)
  const tilt: Tilt = useSharedValue({ x: 0, y: 0 })
  const baseline = useSharedValue<{ x: number; y: number } | null>(null)
  const gravity = useAnimatedSensor(SensorType.GRAVITY)

  const frame = useFrameCallback(({ timeSincePreviousFrame }) => {
    'worklet'

    const dt = Math.min(timeSincePreviousFrame ?? 16, 64) / 1000
    time.value += dt

    const g = gravity.sensor.value
    if (g.x === 0 && g.y === 0 && g.z === 0) return
    const gx = (g.x * DOWN) / 9.81
    const gy = (g.y * DOWN) / 9.81
    const prev = baseline.value ?? { x: gx, y: gy }

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

    const follow = Math.min(1, dt * 8)
    tilt.value = {
      x: tilt.value.x + (target.x - tilt.value.x) * follow,
      y: tilt.value.y + (target.y - tilt.value.y) * follow,
    }
  }, false)

  useEffect(() => {
    frame.setActive(running && appRuns)
  }, [running, appRuns, frame])

  return { time, tilt }
}

export default useWelcomeMotion
