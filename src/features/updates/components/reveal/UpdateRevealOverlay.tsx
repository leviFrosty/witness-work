import { useEffect, useRef, useState } from 'react'
import {
  BackHandler,
  LayoutChangeEvent,
  LayoutRectangle,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
} from 'react-native-reanimated'
import { useIsFocused } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import { usePreferences } from '@/stores/preferences'
import { useTakeover } from '@/stores/takeover'
import LaunchSplash, { splashMarkWidth } from '@/app/launch/LaunchSplash'
import { isLaunching } from '@/app/launch/launchState'
import {
  STAGE,
  STAGE_INSET,
  STAGE_SCALE,
} from '@/features/onboarding/constants/welcome'
import useWelcomeMotion from '@/features/onboarding/hooks/useWelcomeMotion'
import { getWelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import WelcomeBackdrop from '@/features/onboarding/components/welcome/WelcomeBackdrop'
import WelcomeCurtain from '@/features/onboarding/components/welcome/WelcomeCurtain'
import { UPDATE_REVEAL_VERSION } from '@/features/updates/constants/updateReveal'
import useRevealPages, {
  RevealPage,
} from '@/features/updates/hooks/useRevealPages'
import useRevealChoreography, {
  RevealEntrance,
} from '@/features/updates/hooks/useRevealChoreography'
import { UpdateRevealSource } from '@/features/updates/stores/updateReveal'
import RevealIntro from '@/features/updates/components/reveal/RevealIntro'
import RevealTour from '@/features/updates/components/reveal/RevealTour'

/** How the reveal was closed. Bounded, safe as an analytics value. */
type CloseMethod = 'later' | 'close' | 'done' | 'back'

interface Props {
  source: UpdateRevealSource
  /** The overlay has faded away; unmount it. */
  onClosed: () => void
}

/**
 * The update reveal: on the first launch after a big update, the splash
 * collapses into the app tile, its ring closes like an install finishing and
 * the new features burst out around it. "See what's new" opens a short tour — a
 * page per feature, mostly picture — that ends on sharing the app with friends
 * on Android.
 *
 * Mounted by `HomeTabStack` above the tabs, in the very first frame of a
 * launch, so it picks up exactly where the native splash leaves off.
 */
const UpdateRevealOverlay = ({ source, onClosed }: Props) => {
  const theme = useTheme()
  const palette = getWelcomePalette(theme)
  const window = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const { set } = usePreferences()
  const { pages: livePages, chips, moreTiles } = useRevealPages()

  // Developer Tools previews the launch version over the running app.
  const [entrance] = useState<RevealEntrance>(() =>
    (source === 'launch' && isLaunching()) || source === 'dev'
      ? reduceMotion
        ? 'calm'
        : 'intro'
      : 'replay'
  )
  const [root, setRoot] = useState<{ width: number; height: number } | null>(
    null
  )
  const [stage, setStage] = useState<LayoutRectangle | null>(null)
  const size = root ?? window
  const hub = stage
    ? { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 }
    : null
  const scale = stage
    ? Math.min(
        STAGE_SCALE.max,
        Math.max(
          STAGE_SCALE.min,
          Math.min(
            (stage.width - STAGE_INSET * 2) / STAGE.width,
            stage.height / STAGE.height
          )
        )
      )
    : 1

  const { time, tilt } = useWelcomeMotion(!reduceMotion)
  const {
    values,
    phase,
    headline,
    splashVisible,
    skippable,
    skipIntro,
    startTour,
    close,
  } = useRevealChoreography({ entrance, ready: root !== null && hub !== null })

  // The tour's pages are fixed as it opens: Buddies' flag loads over the
  // network, and a page appearing mid-tour would shift the ones being swiped.
  const [tourPages, setTourPages] = useState<RevealPage[] | null>(null)
  if (phase === 'tour' && !tourPages) setTourPages(livePages)
  const pages = tourPages ?? livePages

  // What the user saw, for the close event.
  const openedAt = useRef(Date.now())
  const viewed = useRef(new Set<string>())
  const lastPage = useRef<string | null>(null)

  useEffect(() => {
    analytics.capture('update_reveal_opened', {
      source,
      entrance,
      reveal_version: UPDATE_REVEAL_VERSION,
    })
  }, [source, entrance])

  const finish = (method: CloseMethod) => {
    analytics.capture('update_reveal_closed', {
      source,
      method,
      stage: phase,
      pages_viewed: viewed.current.size,
      page_count: pages.length,
      last_page: lastPage.current ?? undefined,
      elapsed_ms: Date.now() - openedAt.current,
    })
    // Closing before the tour leaves a way back in from the tray. A reveal
    // that's been toured stays seen, even when replayed and closed early.
    const { updateReveal } = usePreferences.getState()
    const toured =
      phase === 'tour' ||
      (updateReveal?.version === UPDATE_REVEAL_VERSION &&
        updateReveal.status === 'seen')
    set({
      updateReveal: {
        version: UPDATE_REVEAL_VERSION,
        status: toured ? 'seen' : 'skipped',
      },
    })
    close(onClosed)
  }

  // Opening the tour is seeing the reveal: no tray item to replay it.
  useEffect(() => {
    if (phase !== 'tour') return
    set({ updateReveal: { version: UPDATE_REVEAL_VERSION, status: 'seen' } })
  }, [phase, set])

  // Android's back button closes the reveal like its own close button, but
  // only while it's the takeover on screen and nothing is pushed over Root;
  // otherwise Back belongs to whatever is in front. Registered again on every
  // render so it stays ahead of the navigators' own handlers.
  const rootFocused = useIsFocused()
  const onScreen = useTakeover(
    (s) => s.arbiter.active?.kind === 'update-reveal'
  )
  useEffect(() => {
    if (!rootFocused || !onScreen) return
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        finish('back')
        return true
      }
    )
    return () => subscription.remove()
  })

  const rootStyle = useAnimatedStyle(() => ({ opacity: 1 - values.veil.value }))
  const splashStyle = useAnimatedStyle(() => ({ opacity: values.splash.value }))
  const tourStyle = useAnimatedStyle(() => ({ opacity: values.tour.value }))

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: palette.base },
        rootStyle,
      ]}
      onLayout={(e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout
        setRoot((prev) =>
          prev?.width === width && prev?.height === height
            ? prev
            : { width, height }
        )
      }}
    >
      {hub && (
        <WelcomeBackdrop
          width={size.width}
          height={size.height}
          hub={hub}
          scale={scale}
          palette={palette}
          time={time}
          tilt={tilt}
          reveal={values.reveal}
          orbits={values.orbits}
          ringStart={values.ringStart}
          ringEnd={values.ringEnd}
          pulse={values.pulse}
          chrome={values.chrome}
        />
      )}
      {phase === 'intro' ? (
        <>
          <RevealIntro
            palette={palette}
            time={time}
            tilt={tilt}
            hub={hub}
            scale={scale}
            stage={stage}
            onStage={(layout) =>
              setStage((prev) =>
                prev?.x === layout.x &&
                prev?.y === layout.y &&
                prev?.width === layout.width &&
                prev?.height === layout.height
                  ? prev
                  : layout
              )
            }
            chips={chips}
            headline={headline}
            values={values}
            skippable={skippable}
            reduceMotion={reduceMotion}
            onSkip={skipIntro}
            onSeeWhatsNew={startTour}
            // Like See what's new, a press before Later has faded in just
            // hurries the intro.
            onLater={() =>
              values.link.value < 0.5 ? skipIntro() : finish('later')
            }
          />
          <WelcomeCurtain
            width={size.width}
            height={size.height}
            hub={hub}
            scale={scale}
            splashMarkWidth={splashMarkWidth(window)}
            palette={palette}
            collapse={values.collapse}
            tileScale={values.tileScale}
            ripple={values.ripple}
            tilt={tilt}
            exit={values.exit}
            reduceMotion={reduceMotion}
          />
        </>
      ) : (
        <Animated.View style={[{ flex: 1 }, tourStyle]}>
          <RevealTour
            pages={pages}
            moreTiles={moreTiles}
            palette={palette}
            time={time}
            reduceMotion={reduceMotion}
            onPageViewed={(id) => {
              viewed.current.add(id)
              lastPage.current = id
            }}
            onDone={() => finish('done')}
            onClose={() => finish('close')}
          />
        </Animated.View>
      )}
      {splashVisible && (
        <Animated.View
          pointerEvents='none'
          style={[StyleSheet.absoluteFill, splashStyle]}
        >
          <LaunchSplash />
        </Animated.View>
      )}
    </Animated.View>
  )
}

export default UpdateRevealOverlay
