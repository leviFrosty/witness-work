import { PropsWithChildren, useCallback, useMemo } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import { Confetti, useConfetti } from '../vendor/ConfettiSkia'
import { ConfettiContext, FireworksCtx, FireOpts } from '../contexts/Confetti'

/**
 * Visual buffer between the global Lottie + chime ending and the Skia fireworks
 * starting, so the two don't visibly butt up against each other. Consumers
 * stacking fireworks after a `playConfetti()` call should wait
 * `CONFETTI_DELAY_MS + CONFETTI_DURATION + FIREWORKS_AFTER_LOTTIE_BUFFER_MS`.
 */
export const FIREWORKS_AFTER_LOTTIE_BUFFER_MS = 200

const DEFAULT_SPOTS: { x: number; y: number }[] = [
  { x: 0.2, y: 0.28 },
  { x: 0.78, y: 0.32 },
  { x: 0.5, y: 0.2 },
  { x: 0.35, y: 0.5 },
  { x: 0.7, y: 0.55 },
]

const DEFAULT_COUNT = 28
const DEFAULT_VELOCITY = 240
const DEFAULT_FADE = true
const DEFAULT_STAGGER_MS = 180

interface Props {}

const ConfettiProvider: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  const confetti = useConfetti()
  const { width, height } = useWindowDimensions()

  const fire = useCallback(
    (opts?: FireOpts) => {
      const count = opts?.count ?? DEFAULT_COUNT
      const velocity = opts?.velocity ?? DEFAULT_VELOCITY
      const fade = opts?.fade ?? DEFAULT_FADE
      const staggerMs = opts?.staggerMs ?? DEFAULT_STAGGER_MS
      const spots = opts?.spots ?? DEFAULT_SPOTS

      spots.forEach((spot, i) => {
        setTimeout(() => {
          confetti.trigger({
            position: { x: width * spot.x, y: height * spot.y },
            count,
            velocity,
            fade,
          })
        }, i * staggerMs)
      })
    },
    [confetti, width, height]
  )

  const ctx = useMemo<FireworksCtx>(
    () => ({
      fire,
      triggerBurst: confetti.trigger,
    }),
    [fire, confetti.trigger]
  )

  return (
    <ConfettiContext.Provider value={ctx}>
      <View style={{ position: 'relative', flex: 1 }}>
        {children}
        {/*
         * Mounted at the UIWindow level so fireworks render above any
         * pushed/modal screens (e.g. the Paywall Thank You screen). Sitting
         * as a sibling of the navigator was occluded by pushed screens at
         * the native view layer, so the burst landed behind the screen.
         */}
        <FullWindowOverlay>
          <Confetti ref={confetti.ref} />
        </FullWindowOverlay>
      </View>
    </ConfettiContext.Provider>
  )
}

export default ConfettiProvider
