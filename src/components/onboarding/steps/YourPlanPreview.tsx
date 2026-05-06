import { View, Pressable } from 'react-native'
import { useEffect, useMemo, useState } from 'react'
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  withSequence,
  cancelAnimation,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'
import MapView, { Marker } from 'react-native-maps'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import {
  faStopwatch,
  faComments,
  faCalendar,
  faBullseye,
  faMap,
  faPlay,
  faPause,
  faBell,
} from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import { styles } from '../Onboarding.styles'
import OnboardingNav from '../OnboardingNav'
import Text from '../../MyText'
import Wrapper from '../../layout/Wrapper'
import ActionButton from '../../ActionButton'
import WeekStripTeaser from '../../WeekStripTeaser'
import useTheme from '../../../contexts/theme'
import i18n, { TranslationKey } from '../../../lib/locales'
import { OnboardingIntent, usePreferences } from '../../../stores/preferences'
import { isPioneer } from '../../../lib/publisherCapabilities'
import { useMarkerColors } from '../../../hooks/useMarkerColors'
import { Theme } from '../../../types/theme'
import type { DayPlan, ServiceReport } from '../../../types/serviceReport'

interface Props {
  goBack: () => void
  goNext: () => void
}

type IntentMeta = {
  id: OnboardingIntent
  icon: IconProp
  accent: (t: Theme) => string
  tint: (t: Theme) => string
  headerKey: TranslationKey
  actionKey: TranslationKey
}

const INTENT_META: Record<OnboardingIntent, IntentMeta> = {
  trackTime: {
    id: 'trackTime',
    icon: faStopwatch,
    accent: (t) => t.colors.purple,
    tint: (t) => t.colors.purpleAlt,
    headerKey: 'yourPlanTrackTimeHeader',
    actionKey: 'yourPlanActionTrackTime',
  },
  returnVisits: {
    id: 'returnVisits',
    icon: faComments,
    accent: (t) => t.colors.cyan,
    tint: (t) => t.colors.cyanAlt,
    headerKey: 'yourPlanReturnVisitsHeader',
    actionKey: 'yourPlanActionReturnVisits',
  },
  planWeek: {
    id: 'planWeek',
    icon: faCalendar,
    accent: (t) => t.colors.indigo,
    tint: (t) => t.colors.indigoAlt,
    headerKey: 'yourPlanPlanWeekHeader',
    actionKey: 'yourPlanActionPlanWeek',
  },
  monthlyGoal: {
    id: 'monthlyGoal',
    icon: faBullseye,
    accent: (t) => t.colors.rose,
    tint: (t) => t.colors.roseAlt,
    headerKey: 'yourPlanMonthlyGoalHeader',
    actionKey: 'yourPlanActionMonthlyGoal',
  },
  mapContacts: {
    id: 'mapContacts',
    icon: faMap,
    accent: (t) => t.colors.orange,
    tint: (t) => t.colors.orangeAlt,
    headerKey: 'yourPlanMapHeader',
    actionKey: 'yourPlanActionMapContacts',
  },
}

const INTENT_ORDER: OnboardingIntent[] = [
  'trackTime',
  'returnVisits',
  'planWeek',
  'monthlyGoal',
  'mapContacts',
]

const SLIDE_MS = 4000

/* ────────────────────────────────────────────────────────────
   PER-INTENT VISUALIZATIONS
   Each takes the active accent so the visual feels continuous
   with the stage tint.
   ──────────────────────────────────────────────────────────── */

const TRACK_BAR_HEIGHT = 20
const TRACK_NO_GOAL_REFERENCE_HRS = 40

const TrackTimeVisual = ({
  accent,
  goalHours,
  active,
}: {
  accent: string
  goalHours: number
  active: boolean
}) => {
  const theme = useTheme()
  // Pick a target hour count that's modest but visible (~12% of goal). The
  // displayed integer and the bar fill are both derived from the same shared
  // value so they stay in lockstep — the count never reads "0" while the bar
  // shows progress. Mirrors the in-app monthly progress bar so the preview
  // matches what they'll see post-onboarding.
  const targetHours =
    goalHours > 0 ? Math.max(1, Math.round(goalHours * 0.12)) : 5
  const referenceHours = goalHours > 0 ? goalHours : TRACK_NO_GOAL_REFERENCE_HRS
  const progress = useSharedValue(0)
  const [displayedHours, setDisplayedHours] = useState(0)

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress)
      progress.value = 0
      setDisplayedHours(0)
      return
    }
    progress.value = 0
    progress.value = withTiming(targetHours, {
      duration: SLIDE_MS - 400,
      easing: Easing.out(Easing.cubic),
    })
    return () => cancelAnimation(progress)
  }, [active, progress, targetHours])

  // Throttle JS updates to the rounded integer — no setState until the
  // displayed number actually changes.
  useAnimatedReaction(
    () => Math.round(progress.value),
    (curr, prev) => {
      if (curr !== prev) {
        scheduleOnRN(setDisplayedHours, curr)
      }
    }
  )

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(progress.value / referenceHours, 1) * 100}%`,
  }))

  return (
    <View style={{ width: '100%', gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontFamily: theme.fonts.bold,
            color: theme.colors.text,
            lineHeight: 32,
          }}
        >
          {displayedHours}
          {goalHours > 0 && (
            <Text
              style={{
                fontSize: 16,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.textAlt,
              }}
            >
              {' '}
              / {goalHours}
            </Text>
          )}
        </Text>
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
          }}
        >
          {goalHours > 0
            ? i18n.t('yourPlanTrackTimeMonthLabel', {
                month: moment().format('MMM'),
              })
            : moment().format('MMMM')}
        </Text>
      </View>
      <View
        style={{
          height: TRACK_BAR_HEIGHT,
          width: '100%',
          backgroundColor: theme.colors.background,
          borderRadius: theme.numbers.borderRadiusSm,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              height: '100%',
              backgroundColor: accent,
              borderRadius: theme.numbers.borderRadiusSm,
            },
            fillStyle,
          ]}
        />
      </View>
    </View>
  )
}

const ShakingBell = ({
  active,
  accent,
  tint,
  delayMs,
}: {
  active: boolean
  accent: string
  tint: string
  delayMs: number
}) => {
  const rotation = useSharedValue(0)

  useEffect(() => {
    if (!active) {
      cancelAnimation(rotation)
      rotation.value = 0
      return
    }
    // Burst-then-pause shake — feels like a notification ping rather than a
    // continuous wobble. delayMs staggers the two bells so they don't fire in
    // unison.
    const startShake = () => {
      rotation.value = withRepeat(
        withSequence(
          withTiming(-1, { duration: 60 }),
          withTiming(1, { duration: 60 }),
          withTiming(-0.7, { duration: 60 }),
          withTiming(0.7, { duration: 60 }),
          withTiming(0, { duration: 60 }),
          withTiming(0, { duration: 1600 })
        ),
        -1,
        false
      )
    }
    if (delayMs > 0) {
      const t = setTimeout(startShake, delayMs)
      return () => {
        clearTimeout(t)
        cancelAnimation(rotation)
      }
    }
    startShake()
    return () => cancelAnimation(rotation)
  }, [active, delayMs, rotation])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 18}deg` }],
  }))

  return (
    <Animated.View
      style={[
        {
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        },
        animatedStyle,
      ]}
    >
      <FontAwesomeIcon icon={faBell} size={12} color={accent} />
    </Animated.View>
  )
}

const ReturnVisitsVisual = ({
  accent,
  tint,
  active,
}: {
  accent: string
  tint: string
  active: boolean
}) => {
  const theme = useTheme()
  const samples: { nameKey: TranslationKey; noteKey: TranslationKey }[] = [
    {
      nameKey: 'yourPlanSampleReturnVisitName',
      noteKey: 'yourPlanSampleReturnVisitNote',
    },
    {
      nameKey: 'yourPlanSampleReturnVisitName2',
      noteKey: 'yourPlanSampleReturnVisitNote2',
    },
  ]
  return (
    <View style={{ width: '100%', gap: 8 }}>
      {samples.map((s, i) => (
        <View
          key={s.nameKey}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.background,
            borderLeftWidth: 3,
            borderLeftColor: accent,
          }}
        >
          <ShakingBell
            active={active}
            accent={accent}
            tint={tint}
            delayMs={i * 320}
          />
          <View style={{ flex: 1, gap: 1 }}>
            <Text
              style={{
                fontSize: 13,
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
            >
              {i18n.t(s.nameKey)}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t(s.noteKey)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

const PlanWeekVisual = () => {
  // Anchor mock plans to the current week so the strip always looks lived-in
  // regardless of when onboarding runs. The real WeekStripTeaser is dropped in
  // here with overrides instead of a bespoke mock visual — keeps the preview
  // honest about what the user will actually see in the app.
  const today = useMemo(() => moment(), [])
  const startOfDisplayWeek = useMemo(
    () => today.clone().startOf('week'),
    [today]
  )

  const mockDayPlans: DayPlan[] = useMemo(
    () => [
      {
        id: 'wp-mock-mon',
        date: startOfDisplayWeek.clone().add(1, 'days').toDate(),
        minutes: 90,
      },
      {
        id: 'wp-mock-wed',
        date: startOfDisplayWeek.clone().add(3, 'days').toDate(),
        minutes: 120,
      },
      {
        id: 'wp-mock-sat',
        date: startOfDisplayWeek.clone().add(6, 'days').toDate(),
        minutes: 180,
      },
    ],
    [startOfDisplayWeek]
  )

  const mockReports: ServiceReport[] = useMemo(
    () => [
      {
        id: 'wp-mock-r-1',
        date: today.clone().subtract(1, 'day').toDate(),
        hours: 1,
        minutes: 30,
      },
    ],
    [today]
  )

  return (
    <View style={{ width: '100%' }} pointerEvents='none'>
      <WeekStripTeaser
        month={today.month()}
        year={today.year()}
        monthsReports={mockReports}
        today={today}
        dayPlansOverride={mockDayPlans}
        recurringPlansOverride={[]}
        onOpenSchedule={() => {}}
      />
    </View>
  )
}

const BAR_COUNT = 30
const FILLED_BAR = 8

const MonthlyGoalVisual = ({
  accent,
  tint,
  active,
}: {
  accent: string
  tint: string
  active: boolean
}) => {
  const theme = useTheme()
  const progress = useSharedValue(0)

  useEffect(() => {
    if (!active) {
      cancelAnimation(progress)
      progress.value = 0
      return
    }
    progress.value = 0
    progress.value = withTiming(1, {
      duration: SLIDE_MS - 400,
      easing: Easing.out(Easing.cubic),
    })
    return () => cancelAnimation(progress)
  }, [active, progress])

  // Pre-compute deterministic heights so they don't shimmer between renders
  const heights = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) =>
        Math.round(40 + Math.abs(Math.sin(i / 3)) * 60)
      ),
    []
  )

  return (
    <View style={{ width: '100%', gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 2,
          height: 56,
        }}
      >
        {heights.map((h, i) => (
          <Bar
            key={i}
            index={i}
            heightPct={h}
            accent={accent}
            tint={tint}
            progress={progress}
          />
        ))}
      </View>
      <Text
        style={{
          fontSize: 12,
          textAlign: 'center',
          color: theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('yourPlanMonthlyGoalPace', {
          day: FILLED_BAR,
          total: BAR_COUNT,
        })}
      </Text>
    </View>
  )
}

const Bar = ({
  index,
  heightPct,
  accent,
  tint,
  progress,
}: {
  index: number
  heightPct: number
  accent: string
  tint: string
  progress: SharedValue<number>
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Bars fill in sequence as progress sweeps 0 → 1 over the slide
    const localProgress = progress.value * BAR_COUNT
    const filled = localProgress > index && index < FILLED_BAR
    return {
      backgroundColor: filled ? accent : tint,
    }
  })
  return (
    <Animated.View
      style={[
        {
          flex: 1,
          height: `${heightPct}%`,
          borderRadius: 1.5,
        },
        animatedStyle,
      ]}
    />
  )
}

const FAKE_USER_LOCATION = {
  latitude: 41.160376,
  longitude: -74.257556,
}

const MapVisual = () => {
  const theme = useTheme()
  const markerColors = useMarkerColors()
  const { colorScheme } = usePreferences()

  // Fake contacts arranged around the fake user location. Offsets are kept
  // small (a few blocks) so they stay inside the initial region.
  const fakeContacts = useMemo(
    () => [
      { dLat: 0.0028, dLng: -0.0034, color: markerColors.withinThePastWeek },
      { dLat: -0.0022, dLng: 0.0018, color: markerColors.longerThanAWeekAgo },
      { dLat: 0.0014, dLng: 0.0042, color: markerColors.longerThanAMonthAgo },
      { dLat: -0.0036, dLng: -0.0026, color: markerColors.noConversations },
      { dLat: 0.0044, dLng: 0.0012, color: markerColors.withinThePastWeek },
      { dLat: -0.0012, dLng: 0.0038, color: markerColors.longerThanAWeekAgo },
    ],
    [markerColors]
  )

  return (
    <View
      pointerEvents='none'
      style={{
        width: '100%',
        height: 150,
        borderRadius: theme.numbers.borderRadiusMd,
        overflow: 'hidden',
        backgroundColor: theme.colors.background,
      }}
    >
      <MapView
        userInterfaceStyle={colorScheme ? colorScheme : undefined}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        toolbarEnabled={false}
        style={{ height: '100%', width: '100%' }}
        initialRegion={{
          latitude: FAKE_USER_LOCATION.latitude,
          longitude: FAKE_USER_LOCATION.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }}
      >
        {/* Fake user-location dot — can't use showsUserLocation since this is a
            preview and we don't want to request permissions or reveal the real
            location. */}
        <Marker coordinate={FAKE_USER_LOCATION} anchor={{ x: 0.5, y: 0.5 }}>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#4285F4',
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}
          />
        </Marker>
        {fakeContacts.map((p, i) => (
          <Marker
            key={i}
            coordinate={{
              latitude: FAKE_USER_LOCATION.latitude + p.dLat,
              longitude: FAKE_USER_LOCATION.longitude + p.dLng,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: p.color,
                borderWidth: 2,
                borderColor: theme.colors.card,
              }}
            />
          </Marker>
        ))}
      </MapView>
    </View>
  )
}

/* ────────────────────────────────────────────────────────────
   STAGE — auto-cycling reel
   ──────────────────────────────────────────────────────────── */

const Stage = ({
  intents,
  goalHours,
  publisherLabel,
  pioneeringLine,
}: {
  intents: OnboardingIntent[]
  goalHours: number
  publisherLabel: string
  pioneeringLine: string | null
}) => {
  const theme = useTheme()
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  const reel = intents
  const reelLength = reel.length
  const active = reel[idx] ?? reel[0]
  const meta = INTENT_META[active]
  const accent = meta.accent(theme)
  const tint = meta.tint(theme)

  // Drives the active progress segment + visual animations.
  const slideProgress = useSharedValue(0)

  useEffect(() => {
    if (paused || reelLength === 0) {
      cancelAnimation(slideProgress)
      return
    }
    const nextIdx = (idx + 1) % reelLength
    scheduleOnUI(() => {
      'worklet'
      cancelAnimation(slideProgress)
      slideProgress.value = 0
      slideProgress.value = withTiming(
        1,
        { duration: SLIDE_MS, easing: Easing.linear },
        (finished) => {
          if (finished) {
            scheduleOnRN(setIdx, nextIdx)
          }
        }
      )
    })
    return () => cancelAnimation(slideProgress)
  }, [idx, paused, reelLength, slideProgress])

  // Cross-fade the visual when the slide changes
  const visualOpacity = useSharedValue(1)
  useEffect(() => {
    visualOpacity.value = 0
    visualOpacity.value = withTiming(1, { duration: 320 })
  }, [idx, visualOpacity])
  const visualStyle = useAnimatedStyle(() => ({
    opacity: visualOpacity.value,
  }))

  if (reel.length === 0) return null

  const visual = (() => {
    switch (active) {
      case 'trackTime':
        return (
          <TrackTimeVisual
            key='trackTime'
            accent={accent}
            goalHours={goalHours}
            active={!paused}
          />
        )
      case 'returnVisits':
        return (
          <ReturnVisitsVisual
            key='returnVisits'
            accent={accent}
            tint={tint}
            active={!paused}
          />
        )
      case 'planWeek':
        return <PlanWeekVisual key='planWeek' />
      case 'monthlyGoal':
        return (
          <MonthlyGoalVisual
            key='monthlyGoal'
            accent={accent}
            tint={tint}
            active={!paused}
          />
        )
      case 'mapContacts':
        return <MapVisual key='mapContacts' />
    }
  })()

  return (
    <View style={{ gap: 12 }}>
      <Pressable
        onPress={() => setPaused((p) => !p)}
        accessibilityLabel={i18n.t(meta.headerKey)}
        accessibilityHint={i18n.t(
          paused ? 'yourPlanAutoTourPaused' : 'yourPlanAutoTourAuto'
        )}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.numbers.borderRadiusLg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        {/* Tinted backdrop — sits behind the whole card */}
        <View
          pointerEvents='none'
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: tint,
            opacity: 0.55,
          }}
        />
        <View style={{ padding: 16, gap: 14 }}>
          {/* Slide header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FontAwesomeIcon
                icon={meta.icon}
                size={18}
                color={theme.colors.textInverse}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontFamily: theme.fonts.bold,
                  color: theme.colors.text,
                }}
              >
                {i18n.t(meta.headerKey)}
              </Text>
              <Text style={{ fontSize: 11, color: theme.colors.textAlt }}>
                {i18n.t('yourPlanBecausePrefix')}{' '}
                <Text
                  style={{
                    fontSize: 11,
                    color: accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t(meta.actionKey)}
                </Text>
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                opacity: 0.7,
              }}
            >
              <FontAwesomeIcon
                icon={paused ? faPlay : faPause}
                size={9}
                color={theme.colors.textAlt}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                }}
              >
                {i18n.t(
                  paused ? 'yourPlanAutoTourPaused' : 'yourPlanAutoTourAuto'
                )}
              </Text>
            </View>
          </View>

          {/* Visual area */}
          <Animated.View
            style={[
              {
                minHeight: 150,
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 6,
              },
              visualStyle,
            ]}
          >
            {visual}
          </Animated.View>

          {/* Per-slide progress segments */}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {reel.map((id, i) => (
              <SegmentBar
                key={id}
                isActive={i === idx}
                isComplete={i < idx}
                accent={accent}
                track={theme.colors.border}
                progress={slideProgress}
                onPress={() => {
                  setIdx(i)
                  setPaused(true)
                }}
              />
            ))}
          </View>
        </View>
      </Pressable>

      {/* Foundation row: role + goal, with pioneering stacked beneath when
          present. Stacking avoids an orphaned "·" wrapping to its own line. */}
      <View style={{ gap: 2 }}>
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {goalHours > 0
            ? i18n.t('yourPlanRoleLine', {
                role: publisherLabel,
                hours: goalHours,
              })
            : i18n.t('yourPlanRoleLineNoGoal', { role: publisherLabel })}
        </Text>
        {pioneeringLine && (
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {pioneeringLine}
          </Text>
        )}
      </View>

      {/* Chip strip */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
        }}
      >
        {reel.map((id, i) => {
          const m = INTENT_META[id]
          const a = m.accent(theme)
          const t = m.tint(theme)
          const on = i === idx
          return (
            <Pressable
              key={id}
              onPress={() => {
                setIdx(i)
                setPaused(true)
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? a : theme.colors.border,
                backgroundColor: on ? t : 'transparent',
              }}
            >
              <FontAwesomeIcon
                icon={m.icon}
                size={9}
                color={on ? a : theme.colors.textAlt}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: theme.fonts.semiBold,
                  color: on ? a : theme.colors.textAlt,
                }}
              >
                {i18n.t(m.headerKey)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const SegmentBar = ({
  isActive,
  isComplete,
  accent,
  track,
  progress,
  onPress,
}: {
  isActive: boolean
  isComplete: boolean
  accent: string
  track: string
  progress: SharedValue<number>
  onPress: () => void
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const w = isActive ? progress.value : isComplete ? 1 : 0
    return {
      width: `${w * 100}%`,
      backgroundColor: accent,
    }
  })
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        height: 3,
        borderRadius: 2,
        backgroundColor: track,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height: '100%' }, animatedStyle]} />
    </Pressable>
  )
}

/* ────────────────────────────────────────────────────────────
   SCREEN
   ──────────────────────────────────────────────────────────── */

const YourPlanPreview = ({ goBack, goNext }: Props) => {
  const theme = useTheme()
  const {
    publisher,
    publisherHours,
    pioneerStartDate,
    name,
    onboardingIntents,
  } = usePreferences()

  const monthlyGoalHours = publisherHours[publisher] ?? 0
  const publisherLabel = i18n.t(publisher)

  const pioneering = isPioneer(publisher) && pioneerStartDate
  const pioneeringLine = pioneering
    ? i18n.t('yourPlanPioneeringSince', {
        date: moment(pioneerStartDate).format('MMM YYYY'),
        days: Math.max(1, moment().diff(moment(pioneerStartDate), 'days')),
      })
    : null

  // Tour the user's picks. If they skipped the picker, show all five so the
  // screen still demonstrates the app rather than rendering an empty stage.
  const reel: OnboardingIntent[] = useMemo(() => {
    const picked = INTENT_ORDER.filter((id) => onboardingIntents.includes(id))
    return picked.length > 0 ? picked : INTENT_ORDER
  }, [onboardingIntents])

  const youOrName = name?.trim() ? name.trim() : i18n.t('yourPlanHeroYou')

  return (
    <Wrapper
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 60,
      }}
    >
      <OnboardingNav goBack={goBack} />
      <View
        style={{
          flex: 1,
          paddingTop: 30,
          paddingBottom: 20,
        }}
      >
        <View
          style={[styles.stepContentContainer, { marginRight: 0, gap: 16 }]}
        >
          <View style={{ gap: 8 }}>
            <Text style={[styles.stepTitle, { marginBottom: 0 }]}>
              {i18n.t('yourPlanHero', { youOrName })}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textAlt,
                lineHeight: 20,
              }}
            >
              {i18n.t('yourPlanIntro')}
            </Text>
          </View>

          <Stage
            intents={reel}
            goalHours={monthlyGoalHours}
            publisherLabel={publisherLabel}
            pioneeringLine={pioneeringLine}
          />
        </View>
      </View>
      <ActionButton onPress={goNext}>{i18n.t('continue')}</ActionButton>
    </Wrapper>
  )
}

export default YourPlanPreview
