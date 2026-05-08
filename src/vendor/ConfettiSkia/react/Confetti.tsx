import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import {
  Canvas,
  Picture,
  Skia,
  createPicture,
} from '@shopify/react-native-skia'
import type { SkPaint } from '@shopify/react-native-skia'
import Config, { ConfettiConfig } from '../core/Config'
import Engine from '../core/Engine'
import SkiaRenderer from '../core/SkiaRenderer'

export interface ConfettiHandle {
  trigger: (config?: Partial<ConfettiConfig>) => void
  clear: () => void
}

export interface ConfettiProps {
  pointerEvents?: 'none' | 'auto'
  /**
   * Fires when the engine transitions between idle and animating. Lets the
   * parent unmount any expensive wrapper (e.g. an iOS `FullWindowOverlay`)
   * while no particles exist so it can't interfere with native hit-testing.
   */
  onActiveChange?: (active: boolean) => void
}

const Confetti = forwardRef<ConfettiHandle, ConfettiProps>(function Confetti(
  { pointerEvents = 'none', onActiveChange },
  ref
) {
  const { width, height } = useWindowDimensions()

  const engineRef = useRef<Engine | null>(null)
  if (engineRef.current === null) engineRef.current = new Engine()

  const paintRef = useRef<SkPaint | null>(null)
  if (paintRef.current === null) paintRef.current = Skia.Paint()

  const lastTimeRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const [, setTick] = useState(0)
  const [active, setActive] = useState(false)
  const onActiveChangeRef = useRef(onActiveChange)
  onActiveChangeRef.current = onActiveChange
  const skipFirstActiveCallback = useRef(true)

  useEffect(() => {
    // Initial active=false on mount is not a real transition — skipping
    // avoids parents unmounting the wrapper before the first trigger lands.
    if (skipFirstActiveCallback.current) {
      skipFirstActiveCallback.current = false
      return
    }
    onActiveChangeRef.current?.(active)
  }, [active])

  const loop = useCallback(
    (time: number) => {
      const engine = engineRef.current!
      const last = lastTimeRef.current
      const delta = last ? (time - last) / 1000 : 0
      lastTimeRef.current = time

      engine.step(delta, { height })

      if (engine.count === 0) {
        rafRef.current = null
        lastTimeRef.current = 0
        setActive(false)
        return
      }

      setTick((t) => (t + 1) % 1_000_000)
      rafRef.current = requestAnimationFrame(loop)
    },
    [height]
  )

  useEffect(() => {
    if (!active) return
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      lastTimeRef.current = 0
    }
  }, [active, loop])

  useImperativeHandle(
    ref,
    () => ({
      trigger: (partial?: Partial<ConfettiConfig>) => {
        const config = Config.init(partial ?? {}, { width, height })
        engineRef.current!.trigger(config)
        setActive(true)
      },
      clear: () => {
        engineRef.current!.clear()
        setActive(false)
      },
    }),
    [width, height]
  )

  const engine = engineRef.current
  const picture =
    engine && engine.count > 0
      ? createPicture((canvas) => {
          const renderer = new SkiaRenderer(canvas, paintRef.current!, Skia)
          engine.draw(renderer)
        })
      : null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={pointerEvents}>
      <Canvas style={styles.canvas}>
        {picture ? <Picture picture={picture} /> : null}
      </Canvas>
    </View>
  )
})

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
})

export default Confetti
