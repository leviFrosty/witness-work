import { useEffect, useMemo, useState } from 'react'
import useDailyMinutes from '@/features/profile/hooks/useDailyMinutes'
import {
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import {
  faPenToSquare,
  faStar,
  faTimes,
} from '@fortawesome/free-solid-svg-icons'
import { faHeart } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import useIsSupporter from '@/hooks/useIsSupporter'
import useConversations from '@/stores/conversationStore'
import Text from '@/components/MyText'
import IconButton from '@/components/IconButton'
import Avatar from '@/components/Avatar'
import { RootStackNavigation } from '@/types/rootStack'
import MonthlyRoutine from '@/components/MonthlyRoutine'
import SinceBadge from '@/components/SinceBadge'
import i18n from '@/lib/locales'
import { getStartDateLabels } from '@/constants/publisher'
import {
  consecutiveMonthsStreak,
  consecutiveWeeksStreak,
  daysLogged,
  minutesInTrailingDays,
  totalMinutes,
} from '@/features/profile/lib/profileStats'

export type OriginRect = { x: number; y: number; width: number; height: number }

interface Props {
  origin: OriginRect | null
  open: boolean
  onClose: () => void
  /** Called after the close animation completes so the small card can fade in. */
  onClosed?: () => void
}

const SPRING = { damping: 20, stiffness: 180, mass: 0.7 }
const ORIGIN_RADIUS = 15
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
  return (
    <View
      style={{
        flex: 1,
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
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
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

const ProfileDetailOverlay = ({ origin, open, onClose, onClosed }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { width: winW, height: winH } = useWindowDimensions()
  const { avatar, pioneerStartDate } = usePreferences()

  const handleEdit = () => {
    onClose()
    navigation.navigate('PreferencesPublisher')
  }
  const {
    type: publisher,
    tracksPioneerStartDate,
    entryMode,
    name: trimmedName,
  } = usePublisher()
  const { since: supporterSince } = useIsSupporter()
  const { conversations } = useConversations()
  const daily = useDailyMinutes()

  const stats = useMemo(() => {
    const total = totalMinutes(daily)
    return {
      totalHours: Math.round(total / 60),
      days: daysLogged(daily),
      streak:
        entryMode === 'hours'
          ? consecutiveMonthsStreak(daily)
          : consecutiveWeeksStreak(daily),
      last30Hours: Math.round(minutesInTrailingDays(daily, 30) / 60),
    }
  }, [daily, entryMode])

  // `mounted` holds the Modal up for the full duration of both open and close
  // animations. Decoupling it from `open` lets the close-spring play out
  // before we unmount and relinquish the hero rect.
  const [mounted, setMounted] = useState(false)
  const progress = useSharedValue(0)

  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useEffect(() => {
    if (!mounted || !origin) return
    if (open) {
      progress.value = withSpring(1, SPRING)
    } else {
      progress.value = withSpring(0, SPRING, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false)
          if (onClosed) runOnJS(onClosed)()
        }
      })
    }
  }, [open, mounted, origin, onClosed, progress])

  const containerStyle = useAnimatedStyle(() => {
    if (!origin) return {}
    const targetX = EXPANDED_MARGIN
    const targetY = insets.top + EXPANDED_MARGIN
    const targetW = winW - EXPANDED_MARGIN * 2
    const targetH = winH - insets.top - insets.bottom - EXPANDED_MARGIN * 2
    return {
      left: interpolate(progress.value, [0, 1], [origin.x, targetX]),
      top: interpolate(progress.value, [0, 1], [origin.y, targetY]),
      width: interpolate(progress.value, [0, 1], [origin.width, targetW]),
      height: interpolate(progress.value, [0, 1], [origin.height, targetH]),
      borderRadius: ORIGIN_RADIUS,
    }
  })

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.55]),
  }))

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1], 'clamp'),
  }))

  const surfaceStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.15], [0, 1], 'clamp'),
  }))

  if (!mounted || !origin) return null

  return (
    <Modal
      transparent
      visible
      animationType='none'
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle='light-content' animated />
      <View style={{ flex: 1 }}>
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
                right: 0,
                bottom: 0,
                left: 0,
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
                right: 0,
                bottom: 0,
                left: 0,
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
                top: ORIGIN_RADIUS,
                right: 4,
                bottom: ORIGIN_RADIUS,
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
                  icon={faPenToSquare}
                  size='lg'
                  onPress={handleEdit}
                />
                <IconButton icon={faTimes} size='xl' onPress={onClose} />
              </View>
              <View
                style={{
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 4,
                }}
              >
                <Avatar avatar={avatar} name={trimmedName} size={96} />
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    fontSize: 22,
                    color: theme.colors.text,
                  }}
                >
                  {trimmedName || i18n.t('profileGreetingNoName')}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t(publisher)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Stat
                  label={i18n.t('profileStatStreak')}
                  value={String(stats.streak)}
                  sub={i18n.t(
                    entryMode === 'hours'
                      ? stats.streak === 1
                        ? 'profileStatStreakUnitMonth'
                        : 'profileStatStreakUnitMonth_plural'
                      : stats.streak === 1
                        ? 'profileStatStreakUnit'
                        : 'profileStatStreakUnit_plural'
                  )}
                />
                {entryMode === 'hours' ? (
                  <Stat
                    label={i18n.t('profileStatDays')}
                    value={String(stats.days)}
                    sub={i18n.t('profileStatDaysSub')}
                  />
                ) : (
                  <Stat
                    label={i18n.t('profileStatConversations')}
                    value={String(conversations.length)}
                    sub={i18n.t('profileStatConversationsSub')}
                  />
                )}
              </View>
              {entryMode === 'hours' && (
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Stat
                    label={i18n.t('profileStatHours')}
                    value={String(stats.totalHours)}
                    sub={i18n.t('profileStatHoursSub')}
                  />
                  <Stat
                    label={i18n.t('profileStatLast30')}
                    value={`${stats.last30Hours}${i18n.t('hoursCompact')}`}
                    sub={i18n.t('profileStatLast30Sub')}
                  />
                </View>
              )}

              {(tracksPioneerStartDate && pioneerStartDate) ||
              supporterSince ? (
                <View style={{ gap: 10 }}>
                  {tracksPioneerStartDate && pioneerStartDate && (
                    <SinceBadge
                      icon={faStar}
                      label={i18n.t(getStartDateLabels(publisher).badge)}
                      value={moment(pioneerStartDate).format('MMMM YYYY')}
                      tint={theme.colors.indigo}
                      tintBg={theme.colors.indigoTranslucent}
                    />
                  )}
                  {supporterSince && (
                    <SinceBadge
                      icon={faHeart}
                      label={i18n.t('profileStatSupporter')}
                      value={moment(supporterSince).format('MMMM YYYY')}
                      tint={theme.colors.supporter}
                      tintBg={theme.colors.supporterTranslucent}
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
            </ScrollView>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  )
}

export default ProfileDetailOverlay
