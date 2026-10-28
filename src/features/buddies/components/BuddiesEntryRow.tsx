import {
  ActivityIndicator,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import { Users as UsersIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import { analytics } from '@/lib/analytics'
import { formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import useBuddiesTogether from '@/features/buddies/hooks/useBuddiesTogether'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const AVATAR_SIZE = 22
const MAX_AVATARS = 3

/**
 * A way into Buddies from where planning happens (under Schedule's title, on
 * the Profile): the buddies the User plans with and what's next with them, or
 * what waits on the User. A dot shows while requests or invitations wait, a
 * spinner while Buddies is confirmed for the first time this session, and the
 * row dims while Buddies is turned off on the server.
 */
export default function BuddiesEntryRow({
  source,
  onBeforeNavigate,
  stacked = false,
  style,
}: {
  /** For `buddies_opened`. */
  source: 'schedule_row' | 'profile'
  /** E.g. closing the Profile, which covers the screen. */
  onBeforeNavigate?: () => void
  /** The summary on a line of its own, where the row is narrow. */
  stacked?: boolean
  /** E.g. margins; nothing shows while Buddies is off. */
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { hasSidebar } = useAdaptiveLayout()
  const availability = useBuddiesAvailability()
  const buddies = useBuddies((state) => state.buddies)
  const requests = useBuddies((state) => state.incomingClaims.length)
  const { needsAnswer, together } = useBuddiesTogether()

  if (availability === 'hidden') return null
  const disabled = availability === 'disabled'
  const loading = availability === 'loading'
  const active = buddies.filter((buddy) => buddy.status === 'active')
  const next = together.find((item) => item.status !== 'declined')
  const summary =
    requests > 0
      ? i18n.t('buddies_requestsWaiting')
      : needsAnswer.length > 0
        ? i18n.t('buddies_needsAnswer')
        : next
          ? i18n.t('buddies_nextTogether', {
              date: formatWeekdayMonthDayCompact(
                moment(next.details.d, 'YYYY-MM-DD')
              ),
            })
          : active.length > 0
            ? i18n.t('buddies_sharingPlans')
            : i18n.t('buddies_emptyTitle')
  // Requests can't be confirmed while Buddies is off.
  const waiting = !disabled && (requests > 0 || needsAnswer.length > 0)

  const open = () => {
    analytics.capture('buddies_opened', {
      source,
      has_requests: requests > 0,
    })
    onBeforeNavigate?.()
    // Beside the iPad sidebar, Buddies is a tab of its own.
    if (hasSidebar) navigation.navigate('Root', { screen: 'Buddies' } as never)
    else navigation.navigate('Buddies')
  }

  return (
    <Button
      onPress={open}
      disabled={disabled || loading}
      accessibilityRole='button'
      accessibilityLabel={
        disabled
          ? i18n.t('buddies_unavailableA11y')
          : `${i18n.t('buddies_title')}, ${summary}`
      }
      testID={`buddies-row-${source}`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: 12,
          borderRadius: theme.numbers.borderRadiusLg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.backgroundLighter,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {active.length > 0 ? (
        <View style={{ flexDirection: 'row' }}>
          {active.slice(0, MAX_AVATARS).map((buddy, index) => (
            <View
              key={buddy.inboxId}
              style={{
                marginStart: index === 0 ? 0 : -6,
                borderRadius: AVATAR_SIZE,
                borderWidth: 2,
                borderColor: theme.colors.backgroundLighter,
              }}
            >
              <BuddyAvatar
                avatar={buddy.avatar}
                name={buddyDisplayName(buddy)}
                color={buddy}
                size={AVATAR_SIZE}
              />
            </View>
          ))}
        </View>
      ) : (
        <LucideIcon icon={UsersIcon} size={18} color={theme.colors.accent} />
      )}
      {stacked ? (
        <View style={{ flex: 1, gap: 1, paddingVertical: 8 }}>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('buddies_title')}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {summary}
          </Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('buddies_title')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>{` · ${summary}`}</Text>
        </Text>
      )}
      {waiting ? (
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.colors.accent,
          }}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator size='small' color={theme.colors.textAlt} />
      ) : (
        <LucideIcon
          icon={ChevronForwardIcon}
          size={14}
          color={theme.colors.textAlt}
        />
      )}
    </Button>
  )
}
