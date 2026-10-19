import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react'
import { View } from 'react-native'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useReducedMotion, useSharedValue } from 'react-native-reanimated'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { errorTracking } from '@/lib/errorTracking'
import { createBuffer, type Viewport } from '@/lib/pixelArt'
import type { PetSoundMoment, PetSpecies } from '@/types/pet'
import {
  createScenePlayer,
  PET_X,
  PET_Y,
  RUG_GIFT_POS,
  SCENE_H,
  SCENE_W,
  VIEW_CARD,
  type PlayerInput,
} from '@/features/pet/art'
import { petSound } from '@/features/pet/lib/names'
import {
  createPetToucher,
  createRubTracker,
} from '@/features/pet/lib/patTricks'
import { createFrameLoop } from '@/features/pet/render/frameLoop'
import PetSpeechBubble from '@/features/pet/render/PetSpeechBubble'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'
import useOnScreen from '@/features/pet/render/useOnScreen'
import useSceneActive from '@/features/pet/render/useSceneActive'

/** How long a sound's bubble stays up. */
const BUBBLE_MS = 1400
/** The gift on the rug, padded for a finger, in scene pixels. */
const GIFT_HIT = {
  x: RUG_GIFT_POS[0] - 5,
  y: RUG_GIFT_POS[1] - 6,
  w: 16,
  h: 14,
}
const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

/** Motions a parent can play on the scene. */
export type PetSceneHandle = {
  /** The species' entrance (defaults to the pet's own). */
  playEntrance: (species?: PetSpecies) => void
  playTrick: () => void
  /** The wake animation of a pet that died. */
  playWake: () => void
  /** A head pat, as a tap would. */
  pat: () => void
  /** Shows the pet's sound for `moment` in a bubble. */
  say: (moment: PetSoundMoment) => void
}

export type PetSceneViewProps = {
  input: PlayerInput
  /** The part of the 180 × 100 scene to show; the view keeps its aspect. */
  viewport?: Viewport
  /** Stops the frame clock (besides losing focus or going to the background). */
  paused?: boolean
  /** Also stops it while the view is scrolled fully out of the window. */
  pauseOffScreen?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  borderRadius?: number
  onSay?: (moment: PetSoundMoment) => void
  onPat?: (kind: 'tap' | 'rub') => void
  /** 15 pats in 5 s: the species' trick started. */
  onTrick?: () => void
  /** A sleeping pet or one that died was touched. */
  onWakeRequest?: () => void
  onGiftTap?: () => void
  ref?: Ref<PetSceneHandle>
}

type Bubble = { moment: PetSoundMoment; id: number }

/**
 * The pet's room, live: a {@link createScenePlayer} driven by a 10 fps clock on
 * the JS thread, drawn with nearest sampling so the pixels stay sharp. Each
 * frame goes to the canvas through a shared value, so frames don't re-render
 * React. Tap to pat, drag sideways to rub (vertical drags still scroll), tap
 * the gift to keep it. The clock pauses on other screens, in the background, at
 * rest with Reduce Motion, and (with `pauseOffScreen`) once scrolled out of
 * view.
 */
export default function PetSceneView({
  input,
  viewport = VIEW_CARD,
  paused,
  pauseOffScreen = false,
  accessibilityLabel,
  accessibilityHint,
  borderRadius = 0,
  onSay,
  onPat,
  onTrick,
  onWakeRequest,
  onGiftTap,
  ref,
}: PetSceneViewProps) {
  const reduceMotion = useReducedMotion()
  const frameRef = useRef<View>(null)
  const running = useSceneActive(paused)
  const onScreen = useOnScreen(frameRef, running && pauseOffScreen)
  const active = running && (!pauseOffScreen || onScreen)
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const image = useSharedValue<SkImage | null>(null)
  const latest = useRef({ input, onSay, onTrick })

  const [scene] = useState(() => {
    const player = createScenePlayer({ reduceMotion })
    const buffer = createBuffer(SCENE_W, SCENE_H)
    // Two frames back stays alive: the UI thread may still be drawing it.
    const recent: SkImage[] = []
    let bubbleId = 0
    const showBubble = (moment: PetSoundMoment) => {
      latest.current.onSay?.(moment)
      setBubble({ moment, id: ++bubbleId })
    }
    const loop = createFrameLoop({
      onFrame: (tMs) => {
        const frame = player.frame(latest.current.input, tMs, buffer)
        const next = bufferToSkImage(frame.buffer)
        if (next) {
          image.set(next)
          recent.push(next)
          if (recent.length > 3) recent.shift()?.dispose()
        }
        if (frame.say) showBubble(frame.say)
        return player.isBusy()
      },
      // The room stays on its last frame; the rest of Home keeps working.
      onError: (error) => {
        if (__DEV__) console.error(error)
        errorTracking.captureException(error, { feature: 'pet' })
      },
    })
    return {
      player,
      loop,
      showBubble,
      toucher: createPetToucher(player),
      rub: createRubTracker(),
      dispose: () => {
        loop.dispose()
        recent.splice(0).forEach((img) => img.dispose())
      },
    }
  })

  useEffect(() => {
    latest.current = { input, onSay, onTrick }
    scene.loop.kick()
  }, [scene, input, onSay, onTrick])

  useEffect(() => {
    scene.player.setReduceMotion(reduceMotion)
    scene.loop.setIdleStops(reduceMotion)
  }, [scene, reduceMotion])

  useEffect(() => {
    scene.loop.setActive(active)
  }, [scene, active])

  useEffect(() => () => scene.dispose(), [scene])

  useEffect(() => {
    if (!bubble) return
    const timer = setTimeout(() => setBubble(null), BUBBLE_MS)
    return () => clearTimeout(timer)
  }, [bubble])

  const now = () => performance.now()
  const touch = (rub: boolean) => {
    const pet = latest.current.input.pet
    if (!pet) return
    const result = scene.toucher.touch(now(), pet, { rub, nowMs: Date.now() })
    // After the touch, so a stopped clock's first frame already shows it.
    scene.loop.kick()
    if (result === 'wake') onWakeRequest?.()
    else if (result === 'pat' || result === 'trick')
      onPat?.(rub ? 'rub' : 'tap')
    if (result === 'trick') latest.current.onTrick?.()
  }

  useImperativeHandle(ref, () => ({
    playEntrance: (species) => {
      const pet = latest.current.input.pet
      const which = species ?? pet?.species
      if (!which) return
      scene.player.playEntrance(which, now())
      scene.loop.kick()
    },
    playTrick: () => {
      const pet = latest.current.input.pet
      if (!pet) return
      scene.player.playTrick(pet.species, now())
      scene.loop.kick()
    },
    playWake: () => {
      scene.player.playWake(now())
      scene.loop.kick()
    },
    pat: () => touch(false),
    say: (moment) => {
      scene.showBubble(moment)
      scene.loop.kick()
    },
  }))

  const scale = width > 0 ? width / viewport[2] : 0
  const height = scale * viewport[3]

  const hitsGift = (x: number, y: number) => {
    if (!latest.current.input.moments?.gift || scale === 0) return false
    const sx = viewport[0] + x / scale
    const sy = viewport[1] + y / scale
    return (
      sx >= GIFT_HIT.x &&
      sx < GIFT_HIT.x + GIFT_HIT.w &&
      sy >= GIFT_HIT.y &&
      sy < GIFT_HIT.y + GIFT_HIT.h
    )
  }

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      if (!success) return
      if (hitsGift(event.x, event.y)) {
        scene.loop.kick()
        onGiftTap?.()
        return
      }
      touch(false)
    })
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart((event) => {
      scene.rub.move(event.x)
    })
    .onUpdate((event) => {
      const steps = scene.rub.move(event.x)
      for (let i = 0; i < steps; i++) touch(true)
    })
    .onFinalize(() => scene.rub.end())

  const species = input.pet?.species
  const bubbleText = bubble && species ? petSound(species, bubble.moment) : null

  return (
    <PointerHover onHoverChange={setHovered}>
      <View
        ref={frameRef}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{
          width: '100%',
          aspectRatio: viewport[2] / viewport[3],
          borderRadius,
          overflow: 'hidden',
        }}
      >
        <GestureDetector gesture={Gesture.Race(pan, tap)}>
          <View
            accessible
            accessibilityRole='button'
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={accessibilityHint}
            onAccessibilityTap={() => touch(false)}
            style={{ flex: 1 }}
          >
            {scale > 0 && (
              <Canvas style={{ width, height }} pointerEvents='none'>
                <Image
                  image={image}
                  x={-viewport[0] * scale}
                  y={-viewport[1] * scale}
                  width={SCENE_W * scale}
                  height={SCENE_H * scale}
                  sampling={SAMPLING}
                />
              </Canvas>
            )}
          </View>
        </GestureDetector>
        {bubbleText && (
          <PetSpeechBubble
            key={bubble?.id}
            text={bubbleText}
            right={width - (PET_X + 8 - viewport[0]) * scale}
            bottom={height - (PET_Y + 6 - viewport[1]) * scale}
          />
        )}
        <HoverTint visible={hovered} borderRadius={borderRadius} />
      </View>
    </PointerHover>
  )
}
