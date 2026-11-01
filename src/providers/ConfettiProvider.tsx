import { PropsWithChildren, useEffect, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import useConfetti from '@/vendor/ConfettiSkia/react/useConfetti'
import type { ConfettiConfig } from '@/vendor/ConfettiSkia/core/Config'
import type ConfettiComponent from '@/vendor/ConfettiSkia/react/Confetti'
import { ConfettiContext, FireworksCtx, FireOpts } from '@/contexts/Confetti'
import useReduceMotionEnabled from '@/hooks/useReduceMotionEnabled'

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
  const { ref: confettiRef } = useConfetti()
  const { width, height } = useWindowDimensions()
  const [overlayMounted, setOverlayMounted] = useState(false)
  const pendingTriggersRef = useRef<Partial<ConfettiConfig>[]>([])

  const reduceMotion = useReduceMotionEnabled()

  const triggerBurst = (cfg?: Partial<ConfettiConfig>) => {
    if (reduceMotion) return
    const handle = confettiRef.current
    if (handle) {
      handle.trigger(cfg)
      return
    }

    pendingTriggersRef.current.push(cfg ?? {})
    setOverlayMounted(true)
  }

  const fire = (opts?: FireOpts) => {
    if (reduceMotion) return
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
  }

  const handleActiveChange = (active: boolean) => {
    if (!active) setOverlayMounted(false)
  }

  useEffect(() => {
    if (!overlayMounted) return
    const handle = confettiRef.current
    if (!handle) return
    const queued = pendingTriggersRef.current
    if (queued.length === 0) return
    pendingTriggersRef.current = []
    for (const cfg of queued) handle.trigger(cfg)
  }, [overlayMounted, confettiRef])

  const ctx: FireworksCtx = { fire, triggerBurst }

  return (
    <ConfettiContext.Provider value={ctx}>
      <View style={{ position: 'relative', flex: 1 }}>
        {children}
        {}
        {overlayMounted ? (
          <SkiaConfetti
            confettiRef={confettiRef}
            onActiveChange={handleActiveChange}
          />
        ) : null}
      </View>
    </ConfettiContext.Provider>
  )
}

function SkiaConfetti({
  confettiRef,
  onActiveChange,
}: {
  confettiRef: ReturnType<typeof useConfetti>['ref']
  onActiveChange: (active: boolean) => void
}) {
  const Confetti: typeof ConfettiComponent =
    require('@/vendor/ConfettiSkia/react/Confetti').default
  return (
    <FullWindowOverlay>
      <Confetti ref={confettiRef} onActiveChange={onActiveChange} />
    </FullWindowOverlay>
  )
}

export default ConfettiProvider
