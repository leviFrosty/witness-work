import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactElement,
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
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { errorTracking } from '@/lib/errorTracking'
import Haptics from '@/lib/haptics'
import i18n from '@/lib/locales'
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
  VISITOR_SPOTS,
  type PlayerInput,
} from '@/features/pet/art'
import { petSound } from '@/features/pet/lib/names'
import {
  createPetToucher,
  createRubTracker,
} from '@/features/pet/lib/patTricks'
import { sceneTapTarget, startsOnPet } from '@/features/pet/lib/sceneTouch'
import { createFrameLoop } from '@/features/pet/render/frameLoop'
import PetSpeechBubble from '@/features/pet/render/PetSpeechBubble'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'
import useOnScreen from '@/hooks/useOnScreen'
import useSceneActive from '@/features/pet/render/useSceneActive'

const BUBBLE_MS = 1400

const VISITOR_BUBBLE_GAP_MS = 200

const HEARTS_CHECK_MS = 3200

const TARGET_HOLD_MS = 200

const VISITOR_HIT: Viewport = [4, 6, 24, 26]

const GIFT_HIT: Viewport = [RUG_GIFT_POS[0] - 5, RUG_GIFT_POS[1] - 6, 16, 14]
const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

const GIFT_ACTION = 'pickUpGift'

export type PetSceneHandle = {
  playEntrance: (species?: PetSpecies) => void
  playTrick: () => void

  playTwirl: () => void

  playWake: () => void

  pat: () => void

  cheer: () => void

  rub: () => void
  endRub: () => void

  say: (moment: PetSoundMoment) => void
}

export type PetSceneViewProps = {
  input: PlayerInput

  viewport?: Viewport

  paused?: boolean

  pauseOffScreen?: boolean
  accessibilityLabel?: string
  accessibilityHint?: string
  borderRadius?: number
  onSay?: (moment: PetSoundMoment) => void
  onPat?: (kind: 'tap' | 'rub') => void

  onTrick?: () => void

  onTwirl?: () => void

  onWakeRequest?: () => void

  onGiftTap?: () => void

  onRoomTap?: () => void

  touchInset?: number

  visitorLines?: readonly string[]

  visitorMenus?: readonly ContextMenuEntries[]

  visitorPreviews?: readonly ReactElement[]
  ref?: Ref<PetSceneHandle>
}

type Bubble = { moment: PetSoundMoment; id: number }

type VisitorBubble = { index: number; id: number }

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
  onTwirl,
  onWakeRequest,
  onGiftTap,
  onRoomTap,
  touchInset = 0,
  visitorLines,
  visitorMenus,
  visitorPreviews,
  ref,
}: PetSceneViewProps) {
  const reduceMotion = useReducedMotion()
  const frameRef = useRef<View>(null)
  const running = useSceneActive(paused)
  const onScreen = useOnScreen(frameRef, running && pauseOffScreen)
  const active = running && (!pauseOffScreen || onScreen)
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState(false)

  const [hearsVisitors, setHearsVisitors] = useState(0)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [visitorBubble, setVisitorBubble] = useState<VisitorBubble | null>(null)
  const image = useSharedValue<SkImage | null>(null)

  const [targeted, setTargeted] = useState<number | null>(null)
  const hold = useRef<{
    timer?: ReturnType<typeof setTimeout>
    menuOpen: boolean
  }>({ menuOpen: false })
  const latest = useRef({
    input,
    onSay,
    onTrick,
    onTwirl,
    visitorLines,
    targeted,
  })

  const [scene] = useState(() => {
    const player = createScenePlayer({ reduceMotion })
    const buffer = createBuffer(SCENE_W, SCENE_H)

    const recent: SkImage[] = []
    let bubbleId = 0
    const showBubble = (moment: PetSoundMoment) => {
      latest.current.onSay?.(moment)
      setBubble({ moment, id: ++bubbleId })
    }
    const state = {
      petBox: null as Viewport | null,

      rubbing: false,

      visitorsDue: false,
    }
    const loop = createFrameLoop({
      onFrame: (tMs) => {
        const { input: shown, targeted: target } = latest.current
        const frame = player.frame(
          target === null || !shown.visitors?.[target]
            ? shown
            : {
                ...shown,
                visitors: shown.visitors.map((visitor, i) =>
                  i === target ? { ...visitor, outlined: true } : visitor
                ),
              },
          tMs,
          buffer
        )
        state.petBox = frame.petBox
        const next = bufferToSkImage(frame.buffer)
        if (next) {
          image.set(next)
          recent.push(next)
          if (recent.length > 3) recent.shift()?.dispose()
        }
        if (frame.say) showBubble(frame.say)
        if (state.visitorsDue && !frame.hearts && !player.isBusy()) {
          state.visitorsDue = false
          if (latest.current.visitorLines?.length)
            setVisitorBubble({ index: 0, id: ++bubbleId })
        }
        return player.isBusy()
      },

      onError: (error) => {
        if (__DEV__) console.error(error)
        errorTracking.captureException(error, { feature: 'pet' })
      },
    })
    return {
      player,
      loop,
      state,
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
    latest.current = { input, onSay, onTrick, onTwirl, visitorLines, targeted }
    scene.loop.kick()
  }, [scene, input, onSay, onTrick, onTwirl, visitorLines, targeted])

  useEffect(() => () => clearTimeout(hold.current.timer), [])

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

  useEffect(() => {
    if (!visitorBubble) return
    const timer = setTimeout(() => {
      const next = visitorBubble.index + 1
      setVisitorBubble(
        next < (latest.current.visitorLines?.length ?? 0)
          ? { index: next, id: visitorBubble.id + 1 }
          : null
      )
    }, BUBBLE_MS + VISITOR_BUBBLE_GAP_MS)
    return () => clearTimeout(timer)
  }, [visitorBubble])

  useEffect(() => {
    if (!hearsVisitors) return
    const timer = setTimeout(() => scene.loop.kick(), HEARTS_CHECK_MS)
    return () => clearTimeout(timer)
  }, [scene, hearsVisitors])

  const now = () => performance.now()
  const touch = (rub: boolean) => {
    const pet = latest.current.input.pet
    if (!pet) return
    const result = scene.toucher.touch(now(), pet, { rub, nowMs: Date.now() })

    scene.loop.kick()
    if (result === 'wake') onWakeRequest?.()
    else if (result === 'pat' || result === 'trick')
      onPat?.(rub ? 'rub' : 'tap')
    if (result !== 'wake' && result !== 'busy' && visitorLines?.length) {
      scene.state.visitorsDue = true
      setVisitorBubble(null)
      setHearsVisitors((n) => n + 1)
    }
    if (result === 'trick') latest.current.onTrick?.()
    if (result === 'twirl') {
      Haptics.success()
      latest.current.onTwirl?.()
    }
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
    playTwirl: () => {
      scene.player.playTwirl(now())
      scene.loop.kick()
    },
    playWake: () => {
      scene.player.playWake(now())
      scene.loop.kick()
    },
    pat: () => touch(false),
    cheer: () => {
      scene.player.cheer(now())
      scene.loop.kick()
    },
    rub: () => touch(true),
    endRub: () => scene.toucher.endRub(),
    say: (moment) => {
      scene.showBubble(moment)
      scene.loop.kick()
    },
  }))

  const scale = width > 0 ? width / viewport[2] : 0
  const height = scale * viewport[3]

  const takeGift = () => {
    scene.loop.kick()
    onGiftTap?.()
  }

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event, success) => {
      if (!success) return
      const target = sceneTapTarget({
        x: event.x - touchInset,
        y: event.y - touchInset,
        scale,
        viewport,
        petBox: scene.state.petBox,
        giftBox: latest.current.input.moments?.gift ? GIFT_HIT : null,
      })
      if (target === 'gift') takeGift()
      else if (target === 'pet') touch(false)
      else onRoomTap?.()
    })
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin((event) => {
      scene.state.rubbing = startsOnPet({
        x: event.x - touchInset,
        y: event.y - touchInset,
        scale,
        viewport,
        petBox: scene.state.petBox,
      })
    })
    .onStart((event) => {
      if (scene.state.rubbing) scene.rub.move(event.x)
    })
    .onUpdate((event) => {
      if (!scene.state.rubbing) return
      const steps = scene.rub.move(event.x)
      for (let i = 0; i < steps; i++) touch(true)
    })
    .onFinalize(() => {
      scene.state.rubbing = false
      scene.rub.end()
      scene.toucher.endRub()
    })

  const species = input.pet?.species
  const gift = onGiftTap ? input.moments?.gift : null
  const bubbleText = bubble && species ? petSound(species, bubble.moment) : null
  const visitors = (input.visitors ?? []).slice(0, VISITOR_SPOTS.length)
  const talking = visitorBubble && visitorLines?.[visitorBubble.index]
  const talkingSpot = visitorBubble && VISITOR_SPOTS[visitorBubble.index]

  const releaseTarget = () => {
    clearTimeout(hold.current.timer)
    if (!hold.current.menuOpen) setTargeted(null)
  }
  const menuOrder = visitors
    .map((_, i) => i)
    .filter((i) => visitorMenus?.[i])
    .sort((a, b) => VISITOR_SPOTS[a][1] - VISITOR_SPOTS[b][1])

  return (
    <PointerHover onHoverChange={setHovered}>
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <View collapsable={false} style={{ padding: touchInset }}>
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
            <View
              accessible
              accessibilityRole='button'
              accessibilityLabel={accessibilityLabel}
              accessibilityHint={accessibilityHint}
              onAccessibilityTap={() => touch(false)}
              accessibilityActions={
                gift
                  ? [
                      {
                        name: GIFT_ACTION,
                        label: i18n.t(`pet.a11y.pickUpGift.${gift}`),
                      },
                    ]
                  : undefined
              }
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === GIFT_ACTION && gift)
                  takeGift()
              }}
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
            {scale > 0 &&
              menuOrder.map((i) => {
                const [x, y] = VISITOR_SPOTS[i]
                return (
                  <View
                    key={i}
                    onTouchStart={() => {
                      clearTimeout(hold.current.timer)
                      hold.current.timer = setTimeout(
                        () => setTargeted(i),
                        TARGET_HOLD_MS
                      )
                    }}
                    onTouchEnd={releaseTarget}
                    onTouchCancel={releaseTarget}
                    style={{
                      position: 'absolute',
                      left: (x + VISITOR_HIT[0] - viewport[0]) * scale,
                      top: (y + VISITOR_HIT[1] - viewport[1]) * scale,
                    }}
                  >
                    {}
                    <ContextMenu
                      actions={visitorMenus![i]}
                      accessible={false}
                      preview={visitorPreviews?.[i]}
                      onOpenChange={(open) => {
                        hold.current.menuOpen = open
                        setTargeted(open ? i : null)
                      }}
                    >
                      <View
                        style={{
                          width: VISITOR_HIT[2] * scale,
                          height: VISITOR_HIT[3] * scale,
                        }}
                      />
                    </ContextMenu>
                  </View>
                )
              })}
            {bubbleText && (
              <PetSpeechBubble
                key={bubble?.id}
                text={bubbleText}
                right={width - (PET_X + 8 - viewport[0]) * scale}
                bottom={height - (PET_Y + 6 - viewport[1]) * scale}
              />
            )}
            {talking && talkingSpot && (
              <PetSpeechBubble
                key={visitorBubble.id}
                text={talking}
                left={(talkingSpot[0] + 10 - viewport[0]) * scale}
                within={width}
                bottom={height - (talkingSpot[1] + 6 - viewport[1]) * scale}
              />
            )}
            <HoverTint visible={hovered} borderRadius={borderRadius} />
          </View>
        </View>
      </GestureDetector>
    </PointerHover>
  )
}
