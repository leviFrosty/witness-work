import {
  Heart as HeartIcon,
  SquarePen as SquarePenIcon,
  Star as StarIcon,
  X as XIcon,
} from 'lucide-react-native'
import { type ReactNode, useEffect, useMemo } from 'react'
import useDailyMinutes from '@/features/profile/hooks/useDailyMinutes'
import {
  Pressable,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native'
import FullWindowOverlay from '@/components/ui/FullWindowOverlay'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import { type OriginRect, useProfileOverlay } from '@/stores/profileOverlay'
import usePublisher from '@/hooks/usePublisher'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useIsSupporter from '@/hooks/useIsSupporter'
import { isFoundingSupporter } from '@/lib/foundingSupporter'
import useConversations from '@/stores/conversationStore'
import { isOwnVisit } from '@/lib/conversations'
import Text from '@/components/ui/MyText'
import IconButton from '@/components/ui/IconButton'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { RootStackNavigation } from '@/types/rootStack'
import ContributionGraph from '@/features/profile/components/ContributionGraph'
import MonthlyRoutine from '@/features/profile/components/MonthlyRoutine'
import SinceBadge from '@/features/profile/components/SinceBadge'
import ProfileBadgesSection from '@/features/profile/components/ProfileBadgesSection'
import i18n from '@/lib/locales'
import { formatPlainNumber } from '@/lib/numbers'
import { getStartDateLabels } from '@/constants/publisher'
import {
  busiestWeekday,
  daysLogged,
  minutesInTrailingDays,
  totalMinutes,
} from '@/features/profile/lib/profileStats'
import { useFormattedMinutes } from '@/lib/minutes'
import { tracking } from '@/lib/tracking'
import { leftForPhysicalX } from '@/lib/direction'
import { useWindowFoldPane } from '@/components/ui/layout/FoldPane'
import { formatDisplay } from '@/lib/dates'

const SPRING = { damping: 20, stiffness: 180, mass: 0.7 }
/** Fading away for a badge view, which grows out of the tapped medallion. */
const VANISH_MS = 160
/** Fading back in as the badge view fades out, to keep browsing badges. */
const RETURN_MS = 220
const SHEET_RADIUS = 15
const EXPANDED_MARGIN = 12

const Stat = ({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) => {
  const theme = useTheme()
  const stacked = useAccessibilityTextSize()
  return (
    <View
      style={{
        // Side by side, the pair shares the row; stacked, each takes its own.
        flex: stacked ? undefined : 1,
        padding: 14,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
        gap: 4,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          letterSpacing: tracking(0.5),
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: theme.fonts.semiBold,
          fontSize: 20,
          color: theme.colors.text,
        }}
      >
        {value}
      </Text>
      {sub && (
        <Text style={{ fontSize: 11, color: theme.colors.textAlt }}>{sub}</Text>
      )}
    </View>
  )
}

type OverlayProps = {
  /**
   * The User's buddies, under their badges, composed in by the app tier; handed
   * the close to run before it navigates.
   */
  renderBuddies?: (onBeforeNavigate: () => void) => ReactNode
}

/**
 * Profile, role, and stats, grown out of the header avatar. Opened from the
 * account menu; HomeTabStack mounts the single instance.
 */
const ProfileDetailOverlay = ({ renderBuddies }: OverlayProps) => {
  const origin = useProfileOverlay((s) => s.origin)
  // The header hands over the origin once idle; until then the overlay can't
  // open, so its stats stay out of the first screen's render.
  if (!origin) return null
  return <ProfileDetailSheet origin={origin} renderBuddies={renderBuddies} />
}

const ProfileDetailSheet = ({
  origin,
  renderBuddies,
}: OverlayProps & { origin: OriginRect }) => {
  const { open, away, close: onClose, stepAway, hide } = useProfileOverlay()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  // At accessibility text sizes the stats stack, so their labels and notes
  // keep whole words.
  const statRowStyle = {
    flexDirection: useAccessibilityTextSize() ? 'column' : 'row',
    gap: 10,
  } as const
  const navigation = useNavigation<RootStackNavigation>()
  const { width: winW, height: winH } = useWindowDimensions()
  const tenureStartDate = usePreferences((s) => s.tenureStartDate)

  const handleEdit = () => {
    onClose()
    navigation.navigate('PreferencesPublisher')
  }
  const { type: publisher, tracksTenure, entryMode } = usePublisher()
  const { since: supporterSince } = useIsSupporter()
  const conversations = useConversations((s) => s.conversations)
  const daily = useDailyMinutes()

  const stats = useMemo(() => {
    const total = totalMinutes(daily)
    return {
      totalMinutes: total,
      days: daysLogged(daily),
      last30Minutes: minutesInTrailingDays(daily, 30),
      busiestWeekday: busiestWeekday(daily, conversations),
      conversations: conversations.filter(isOwnVisit).length,
    }
  }, [daily, conversations])
  const totalDisplay = useFormattedMinutes(stats.totalMinutes)
  const last30Display = useFormattedMinutes(stats.last30Minutes)

  // Persistent mount once origin is known: heavy children render at expanded
  // dimensions before the user taps so the open spring is pure opacity/morph.
  // FullWindowOverlay (vs RN Modal) renders into a separate UIWindow whose
  // hit-test correctly falls through transparent areas, so a closed-but-mounted
  // overlay doesn't eat home-screen taps.
  const progress = useSharedValue(0)
  const vanish = useSharedValue(1)

  // Clear of iPhone Duo's vertical bar, and to one side of its fold.
  const pane = useWindowFoldPane()
  const targetY = insets.top + EXPANDED_MARGIN
  const targetW = pane.width - EXPANDED_MARGIN * 2
  const targetX = leftForPhysicalX(pane.x + EXPANDED_MARGIN, targetW, winW)
  const targetH = winH - insets.top - insets.bottom - EXPANDED_MARGIN * 2

  useEffect(() => {
    // Away, it stays full size and unseen until the badge view closes.
    if (away) return
    if (open && vanish.value < 1)
      vanish.value = withTiming(1, { duration: RETURN_MS })
    progress.value = withSpring(open ? 1 : 0, SPRING, (finished) => {
      // Visible again for the next open if it closed while faded out. Not on
      // open: Android's Modal remounts the content and misses that write.
      if (finished && !open) vanish.value = 1
    })
  }, [open, away, progress, vanish])

  // Leaves the medallion's spot to the badge view instead of shrinking past it,
  // and comes back when that closes.
  const stepAwayForBadge = () => {
    stepAway()
    vanish.value = withTiming(0, { duration: VANISH_MS }, (finished) => {
      if (finished) scheduleOnRN(hide)
    })
  }

  // Measured in screen coordinates; `left` is mirrored in RTL.
  const originLeft = leftForPhysicalX(origin.x, origin.width, winW)
  const containerStyle = useAnimatedStyle(() => ({
    left: interpolate(progress.value, [0, 1], [originLeft, targetX]),
    top: interpolate(progress.value, [0, 1], [origin.y, targetY]),
    width: interpolate(progress.value, [0, 1], [origin.width, targetW]),
    height: interpolate(progress.value, [0, 1], [origin.height, targetH]),
    // Starts as the round avatar, settles into the sheet's corners.
    borderRadius: interpolate(
      progress.value,
      [0, 1],
      [origin.width / 2, SHEET_RADIUS]
    ),
  }))

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.55]),
  }))

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1], 'clamp'),
  }))

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15], [0, 1], 'clamp'),
  }))

  const vanishStyle = useAnimatedStyle(() => ({ opacity: vanish.value }))

  return (
    <FullWindowOverlay open={open} onClose={onClose}>
      {open && <StatusBar barStyle='light-content' animated />}
      <Animated.View
        style={[{ flex: 1 }, vanishStyle]}
        pointerEvents={open && !away ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      >
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        >
          <Animated.View
            style={[{ flex: 1, backgroundColor: '#000' }, backdropStyle]}
          />
        </Pressable>
        <Animated.View
          style={[{ position: 'absolute', overflow: 'hidden' }, containerStyle]}
        >
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: targetW,
                height: targetH,
                backgroundColor: theme.colors.card,
              },
              surfaceStyle,
            ]}
          />
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                width: targetW,
                height: targetH,
              },
              contentStyle,
            ]}
          >
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 24,
                paddingBottom: insets.bottom + 48,
                gap: 20,
              }}
              scrollIndicatorInsets={{
                top: SHEET_RADIUS,
                right: 4,
                bottom: SHEET_RADIUS,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <IconButton
                  icon={SquarePenIcon}
                  size='lg'
                  accessibilityLabel={i18n.t('editProfile')}
                  onPress={handleEdit}
                />
                <IconButton
                  icon={XIcon}
                  size='xl'
                  accessibilityLabel={i18n.t('close')}
                  onPress={onClose}
                />
              </View>
              <ProfileCard readOnly hideBadges />
              <ProfileBadgesSection
                onBeforeNavigate={onClose}
                onBeforeOpenBadge={stepAwayForBadge}
              />
              {renderBuddies?.(onClose)}

              <View style={statRowStyle}>
                <Stat
                  label={i18n.t('profileStatBusiestDay')}
                  value={
                    stats.busiestWeekday === null
                      ? '—'
                      : moment.weekdays(stats.busiestWeekday)
                  }
                  sub={i18n.t('profileStatBusiestDaySub')}
                />
                {entryMode === 'hours' ? (
                  <Stat
                    label={i18n.t('profileStatDays')}
                    value={formatPlainNumber(stats.days)}
                    sub={i18n.t('profileStatDaysSub')}
                  />
                ) : (
                  <Stat
                    label={i18n.t('profileStatConversations')}
                    value={formatPlainNumber(stats.conversations)}
                    sub={i18n.t('profileStatConversationsSub')}
                  />
                )}
              </View>
              {entryMode === 'hours' && (
                <View style={statRowStyle}>
                  <Stat
                    label={i18n.t('profileStatHours')}
                    value={totalDisplay.formatted}
                    sub={i18n.t('profileStatHoursSub')}
                  />
                  <Stat
                    label={i18n.t('profileStatLast30')}
                    value={last30Display.formatted}
                    sub={i18n.t('profileStatLast30Sub')}
                  />
                </View>
              )}

              {(tracksTenure && tenureStartDate) || supporterSince ? (
                <View style={{ gap: 10 }}>
                  {tracksTenure && tenureStartDate && (
                    <SinceBadge
                      icon={StarIcon}
                      label={i18n.t(getStartDateLabels(publisher).badge)}
                      value={formatDisplay(tenureStartDate, 'MMMM YYYY')}
                      tint={theme.colors.indigo}
                      tintBg={theme.colors.indigoTranslucent}
                    />
                  )}
                  {supporterSince && (
                    <SinceBadge
                      icon={HeartIcon}
                      label={i18n.t(
                        isFoundingSupporter(supporterSince)
                          ? 'profileStatFoundingSupporter'
                          : 'profileStatSupporter'
                      )}
                      value={formatDisplay(supporterSince, 'MMMM YYYY')}
                      tint={theme.colors.supporter}
                      tintBg={theme.colors.supporterTranslucent}
                      iconFill={theme.colors.supporter}
                    />
                  )}
                </View>
              ) : null}

              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.text,
                  }}
                >
                  {i18n.t('monthlyRoutine')}
                </Text>
                <MonthlyRoutine onBeforeNavigate={onClose} />
              </View>
              {entryMode === 'hours' && (
                <View style={{ gap: 10 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: theme.fonts.semiBold,
                      color: theme.colors.text,
                    }}
                  >
                    {i18n.t('profileActivityTitle')}
                  </Text>
                  <ContributionGraph daily={daily} />
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </FullWindowOverlay>
  )
}

export default ProfileDetailOverlay
