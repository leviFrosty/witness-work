import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import moment from 'moment'
import Card from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import HomeSectionMenu from '@/components/HomeSectionMenu'
import useTheme from '@/contexts/theme'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import BuddyTogetherRow from '@/features/buddies/components/BuddyTogetherRow'
import SharedEventSummary from '@/features/buddies/components/SharedEventSummary'
import ShareAnswerButtons from '@/features/buddies/components/ShareAnswerButtons'
import useAnswerShare from '@/features/buddies/hooks/useAnswerShare'
import useBuddiesAvailability from '@/features/buddies/hooks/useBuddiesAvailability'
import useBuddiesTogether from '@/features/buddies/hooks/useBuddiesTogether'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { shareRefFromKey } from '@/features/buddies/lib/state'
import type { BuddyTogetherItem } from '@/features/buddies/lib/together'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Rows on Home; the rest wait on the Buddies screen. */
const MAX_ROWS = 3
/** How far ahead answered Plans and Follow-ups show. */
const AHEAD_DAYS = 14

const AVATAR_SIZE = 24

/**
 * Home's Together section: buddies' invitations still waiting on an answer,
 * answered in place, then what's planned with buddies over the next two weeks.
 * Shows nothing until there's something, or while Buddies isn't usable.
 */
export default function BuddiesHomeSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const availability = useBuddiesAvailability()
  const buddies = useBuddies((state) => state.buddies)
  const requests = useBuddies((state) => state.incomingClaims.length)
  const { needsAnswer, together } = useBuddiesTogether()
  const today = useToday()
  const { busy, answer } = useAnswerShare('home')

  if (availability !== 'enabled') return null
  const until = moment(today).add(AHEAD_DAYS, 'days').format('YYYY-MM-DD')
  const rows = [
    ...needsAnswer,
    ...together.filter((item) => item.details.d <= until),
  ].slice(0, MAX_ROWS)
  if (rows.length === 0) return null

  const openBuddies = () => {
    analytics.capture('buddies_opened', {
      source: 'home_together',
      has_requests: requests > 0,
    })
    navigation.navigate('Buddies')
  }

  const row = (item: BuddyTogetherItem, index: number) => {
    const buddy = buddies.find((b) => b.inboxId === item.inboxId)
    const name = buddy ? buddyDisplayName(buddy) : ''
    const last = index === rows.length - 1
    const avatar = (
      <BuddyAvatar
        avatar={buddy?.avatar}
        name={name}
        color={buddy}
        size={AVATAR_SIZE}
      />
    )
    if (item.direction === 'outgoing' || item.status !== 'pending')
      return (
        <BuddyTogetherRow
          key={item.key}
          item={item}
          buddyName={name}
          avatar={avatar}
          last={last}
          busy={busy}
          onAnswer={(reply) =>
            item.direction === 'incoming' &&
            answer(item.shareKey, item.type, reply)
          }
        />
      )
    const isFollowUp = item.type === 'followUp'
    return (
      <View
        key={item.key}
        style={{
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 15,
          borderBottomWidth: last ? 0 : 1,
          borderColor: theme.colors.border,
        }}
      >
        <XView style={{ gap: 8 }}>
          {avatar}
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t(
              isFollowUp
                ? 'buddies_notifFollowUpInvite'
                : 'buddies_notifPlanInvite',
              { name }
            )}
          </Text>
        </XView>
        <SharedEventSummary
          details={item.details}
          isFollowUp={isFollowUp}
          onOpen={() => {
            const share = shareRefFromKey(item.shareKey)
            if (isFollowUp) navigation.navigate('Follow-Up Invitation', share)
            else navigation.navigate('Plan Details', { share })
          }}
        />
        <ShareAnswerButtons
          disabled={busy}
          onAnswer={(reply) => answer(item.shareKey, item.type, reply)}
          plan={!isFollowUp}
        />
      </View>
    )
  }

  return (
    <Card style={{ paddingVertical: 0, paddingHorizontal: 0, gap: 0 }}>
      <HomeSectionMenu
        onPress={openBuddies}
        accessibilityLabel={`${i18n.t('buddies_together')}, ${i18n.t('buddies_title')}`}
        hoverRadius={theme.numbers.borderRadiusLg}
        actions={[
          {
            id: 'open_buddies',
            title: i18n.t('buddies_title'),
            systemImage: 'person.2',
            onPress: openBuddies,
          },
        ]}
      >
        <XView
          style={{
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 48,
            paddingHorizontal: 15,
            paddingTop: 4,
            borderBottomWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text
            style={{
              flexShrink: 1,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textTransform: 'uppercase',
              letterSpacing: tracking(0.5),
            }}
          >
            {i18n.t('buddies_together')}
          </Text>
          <XView style={{ gap: 4, flexShrink: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('buddies_title')}
            </Text>
            <LucideIcon
              icon={ChevronForwardIcon}
              size={12}
              color={theme.colors.textAlt}
            />
          </XView>
        </XView>
      </HomeSectionMenu>
      {rows.map(row)}
    </Card>
  )
}
