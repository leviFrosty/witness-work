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

/** How long a sound's bubble stays up. */
const BUBBLE_MS = 1400
/** Between one visitor's bubble and the next. */
const VISITOR_BUBBLE_GAP_MS = 200
/**
 * After a pat, when to check again that its hearts are gone, in case the clock
 * stopped (Reduce Motion) before they were.
 */
const HEARTS_CHECK_MS = 3200
/** How long a finger rests on a visitor before it's outlined. */
const TARGET_HOLD_MS = 200
/** The part of a visitor's sprite its long press covers, in sprite pixels. */
const VISITOR_HIT: Viewport = [4, 6, 24, 26]
/** The gift on the rug, padded for a finger, in scene pixels. */
const GIFT_HIT: Viewport = [RUG_GIFT_POS[0] - 5, RUG_GIFT_POS[1] - 6, 16, 14]
const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }
/** The screen reader action that keeps the gift, as a tap on it does. */
const GIFT_ACTION = 'pickUpGift'

/** Motions a parent can play on the scene. */
export type PetSceneHandle = {
  /** The species' entrance (defaults to the pet's own). */
  playEntrance: (species?: PetSpecies) => void
  playTrick: () => void
  /** The scratch twirl, as a long scrub would start it. */
  playTwirl: () => void
  /** The wake animation of a pet that died. */
  playWake: () => void
  /** A head pat, as a tap would. */
  pat: () => void
  /** Happy, with a burst of hearts: its hearts went up. */
  cheer: () => void
  /** One rub step, as a drag across the pet makes; `endRub` lifts the finger. */
  rub: () => void
  endRub: () => void
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
  /** A long scrub on the pet: it twirls (with a success haptic). */
  onTwirl?: () => void
  /** A sleeping pet or one that died was touched. */
  onWakeRequest?: () => void
  /** The gift was tapped, or picked up with a screen reader action. */
  onGiftTap?: () => void
  /**
   * A tap that missed the pet and the gift: anywhere else in the room, or in
   * the `touchInset` around it.
   */
  onRoomTap?: () => void
  /**
   * Points around the picture that still take its taps (as room taps), so a
   * card's padding around the room responds too.
   */
  touchInset?: number
  /**
   * What each visiting pet says, one after another, once the hearts from
   * patting the pet have floated away; in `input.visitors` order.
   */
  visitorLines?: readonly string[]
  /**
   * Each visiting pet's long-press menu, in `input.visitors` order. While a
   * finger rests on one and while its menu is open, it's outlined in front of
   * the others.
   */
  visitorMenus?: readonly ContextMenuEntries[]
  /** What iOS lifts above each visitor's menu, in `input.visitors` order. */
  visitorPreviews?: readonly ReactElement[]
  ref?: Ref<PetSceneHandle>
}

type Bubble = { moment: PetSoundMoment; id: number }
/** Which visitor is talking. */
type VisitorBubble = { index: number; id: number }

/**
 * The pet's room, live: a {@link createScenePlayer} driven by a 10 fps clock on
 * the JS thread, drawn with nearest sampling so the pixels stay sharp. Each
 * frame goes to the canvas through a shared value, so frames don't re-render
 * React. Tap the pet to pat it, drag sideways across it to rub (vertical drags
 * still scroll; a long scrub makes it twirl), tap the gift to keep it, and tap
 * anywhere else for `onRoomTap`; screen readers get an action for the gift
 * while it's there, since their tap pats. The clock pauses on other screens, in
 * the background, at rest with Reduce Motion, and (with `pauseOffScreen`) once
 * scrolled out of view.
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
  /** Bumped on each pat that has visitors waiting to speak. */
  const [hearsVisitors, setHearsVisitors] = useState(0)
  const [bubble, setBubble] = useState<Bubble | null>(null)
  const [visitorBubble, setVisitorBubble] = useState<VisitorBubble | null>(null)
  const image = useSharedValue<SkImage | null>(null)
  /** The visitor being long-pressed, outlined. */
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
    // Two frames back stays alive: the UI thread may still be drawing it.
    const recent: SkImage[] = []
    let bubbleId = 0
    const showBubble = (moment: PetSoundMoment) => {
      latest.current.onSay?.(moment)
      setBubble({ moment, id: ++bubbleId })
    }
    const state = {
      /** Where the pet was last drawn, for telling pats from room taps. */
      petBox: null as Viewport | null,
      /** The current drag started on the pet, so it rubs. */
      rubbing: false,
      /** The pet was patted: the visitors speak once its hearts are gone. */
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
      // The room stays on its last frame; the rest of Home keeps working.
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

  // Each visitor says its line in turn, a short pause between them.
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

  // A check for the hearts' end, kept for a clock that stopped before it.
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
    // After the touch, so a stopped clock's first frame already shows it.
    scene.loop.kick()
    if (result === 'wake') onWakeRequest?.()
    else if (result === 'pat' || result === 'trick')
      onPat?.(rub ? 'rub' : 'tap')
    if (result !== 'wake' && result !== 'busy' && visitorLines?.length) {
      // Patting again before they've spoken waits for the new hearts.
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

  // Gesture points are in the inset view; the picture starts `touchInset` in.
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
  // Front to back as drawn, so a pet in front takes the long press.
  // Lifting the finger clears the outline, unless the menu took over.
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
                    // A finger that rests on it outlines it, before the menu.
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
                    {/* Screen readers reach the same actions in the pet's
                    details, which list today's visitors. */}
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
                // From above the visitor's head, kept inside the room.
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
