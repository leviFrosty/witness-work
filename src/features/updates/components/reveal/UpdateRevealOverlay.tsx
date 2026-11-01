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
import i18n from '@/lib/locales'
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
import FoldPane from '@/components/ui/layout/FoldPane'

type CloseMethod = 'later' | 'close' | 'done' | 'back'

interface Props {
  source: UpdateRevealSource

  onClosed: () => void
}

const UpdateRevealOverlay = ({ source, onClosed }: Props) => {
  const theme = useTheme()
  const palette = getWelcomePalette(theme)
  const window = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const { set } = usePreferences()
  const { pages: livePages, chips } = useRevealPages()

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

  const [tourPages, setTourPages] = useState<RevealPage[] | null>(null)
  if (phase === 'tour' && !tourPages) setTourPages(livePages)
  const pages = tourPages ?? livePages

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

  useEffect(() => {
    if (phase !== 'tour') return
    set({ updateReveal: { version: UPDATE_REVEAL_VERSION, status: 'seen' } })
  }, [phase, set])

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
          <FoldPane pointerEvents='auto'>
            <RevealTour
              pages={pages}
              palette={palette}
              time={time}
              reduceMotion={reduceMotion}
              onPageViewed={(id) => {
                viewed.current.add(id)
                lastPage.current = id
              }}
              finish={{
                label: i18n.t('updateReveal_takeMeHome'),
                onPress: () => finish('done'),
              }}
              exit={{ onPress: () => finish('close') }}
            />
          </FoldPane>
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
