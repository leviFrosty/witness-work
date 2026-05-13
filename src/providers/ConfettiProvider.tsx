import {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useWindowDimensions, View } from 'react-native'
import { FullWindowOverlay } from 'react-native-screens'
import { Confetti, ConfettiConfig, useConfetti } from '@/vendor/ConfettiSkia'
import { ConfettiContext, FireworksCtx, FireOpts } from '@/contexts/Confetti'

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
  const [overlayMounted, setOverlayMounted] = useState(false)
  const pendingTriggersRef = useRef<Partial<ConfettiConfig>[]>([])

  /**
   * Drains any triggers that arrived while the FullWindowOverlay was still
   * mounting (and therefore before `confetti.ref.current` had attached).
   * Without this, the first burst after an idle period would silently no-op.
   */
  const drainPendingTriggers = useCallback(() => {
    const handle = confetti.ref.current
    if (!handle) return
    const queued = pendingTriggersRef.current
    if (queued.length === 0) return
    pendingTriggersRef.current = []
    for (const cfg of queued) handle.trigger(cfg)
  }, [confetti.ref])

  const triggerBurst = useCallback(
    (cfg?: Partial<ConfettiConfig>) => {
      const handle = confetti.ref.current
      if (handle) {
        handle.trigger(cfg)
        return
      }
      // Overlay not mounted yet — queue, mount, drain on next frame.
      pendingTriggersRef.current.push(cfg ?? {})
      setOverlayMounted(true)
    },
    [confetti.ref]
  )

  const fire = useCallback(
    (opts?: FireOpts) => {
      const count = opts?.count ?? DEFAULT_COUNT
      const velocity = opts?.velocity ?? DEFAULT_VELOCITY
      const fade = opts?.fade ?? DEFAULT_FADE
      const staggerMs = opts?.staggerMs ?? DEFAULT_STAGGER_MS
      const spots = opts?.spots ?? DEFAULT_SPOTS

      spots.forEach((spot, i) => {
        setTimeout(() => {
          triggerBurst({
            position: { x: width * spot.x, y: height * spot.y },
            count,
            velocity,
            fade,
          })
        }, i * staggerMs)
      })
    },
    [triggerBurst, width, height]
  )

  /**
   * Confetti reports `true` the moment its engine accepts a trigger and `false`
   * after the last particle is culled. We keep the FullWindowOverlay mounted
   * while active and unmount it the instant the engine goes idle so native
   * sheets/pickers underneath aren't competing with a UIWindow-level container
   * that React Native's touch handler is attached to.
   */
  const handleActiveChange = useCallback((active: boolean) => {
    if (!active) setOverlayMounted(false)
  }, [])

  useEffect(() => {
    if (!overlayMounted) return
    drainPendingTriggers()
  }, [overlayMounted, drainPendingTriggers])

  const ctx = useMemo<FireworksCtx>(
    () => ({
      fire,
      triggerBurst,
    }),
    [fire, triggerBurst]
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
         *
         * Conditional mount: the iOS FullWindowOverlay attaches an
         * `RCTSurfaceTouchHandler` to a container that lives directly in the
         * UIWindow, sibling to any natively presented sheet (Share,
         * UIColorPicker, etc.). Even with `pointerEvents="none"` on the
         * inner View, leaving the overlay mounted at all times has been
         * observed to swallow taps on those sheets. Mounting it only while
         * particles are alive keeps the celebration working without leaving
         * a permanent UIWindow-level touch surface.
         */}
        {overlayMounted ? (
          <FullWindowOverlay>
            <Confetti ref={confetti.ref} onActiveChange={handleActiveChange} />
          </FullWindowOverlay>
        ) : null}
      </View>
    </ConfettiContext.Provider>
  )
}

export default ConfettiProvider
