import moment from 'moment'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { UserPlus as UserPlusIcon } from 'lucide-react-native'
import type { PlanListItem } from '@/types/timeEntry'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { storedDayKey } from '@/lib/normalizeDate'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import ShareReplyBadge, {
  shareReplyLabel,
} from '@/features/buddies/components/ShareReplyBadge'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import {
  joinRequestInvite,
  openJoinRequestsForPlan,
} from '@/features/buddies/lib/joinRequests'
import sendJoinRequestInvite from '@/features/buddies/lib/sendJoinRequestInvite'
import { planEndsAt, planShareKey } from '@/features/buddies/lib/shares'
import type {
  IncomingJoinRequest,
  UnsentShare,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import ShareBuddyRow from '@/features/buddies/components/ShareBuddyRow'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'

export default function PlanDetailsBuddies({
  item,
  now,
  onInvited,
  onOpenPlan,
}: {
  item: PlanListItem
  now: number

  onInvited: () => void

  onOpenPlan?: (target: RootStackParamList['Plan Details']) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const joinRequests = useBuddies((state) => state.joinRequests)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const updateDayPlan = useServiceReport((state) => state.updateDayPlan)
  const dayPlan = item.type === 'day' ? item.plan : undefined
  const replies = useShareReplies(
    dayPlan?.buddies?.length ? planShareKey(dayPlan.id) : undefined
  )
  const unsent = useBuddies((state) =>
    dayPlan ? state.unsentShares[planShareKey(dayPlan.id)] : undefined
  )

  if (!enabled || dayPlan?.buddyShare) return null

  const invitedIds = dayPlan?.buddies ?? []
  const invited = buddies.filter((buddy) => invitedIds.includes(buddy.inboxId))

  const former = Object.entries(unsent ?? {}).flatMap(([inboxId, entry]) =>
    !buddies.some((buddy) => buddy.inboxId === inboxId)
      ? [{ inboxId, entry }]
      : []
  )
  const asking = openJoinRequestsForPlan(
    item.plan,
    dayPlan
      ? storedDayKey(dayPlan.date)
      : moment(item.date).format('YYYY-MM-DD'),
    Object.values(joinRequests),
    dayPlans,
    recurringPlans,
    now
  ).flatMap((request) => {
    const buddy = buddies.find((b) => b.inboxId === request.from)
    return buddy ? [{ buddy, request }] : []
  })
  const askingIds = asking.map(({ buddy }) => buddy.inboxId)
  const uninvited =
    dayPlan && planEndsAt(dayPlan) > now
      ? buddies.filter(
          (buddy) =>
            buddy.status === 'active' &&
            !invitedIds.includes(buddy.inboxId) &&
            !askingIds.includes(buddy.inboxId)
        )
      : []
  if (invited.length + former.length + asking.length + uninvited.length === 0)
    return null

  const invite = (inboxId: string) => {
    if (!dayPlan) return
    updateDayPlan({ id: dayPlan.id, buddies: [...invitedIds, inboxId] })
  }

  const inviteAsker = (request: IncomingJoinRequest) => {
    const invitation = joinRequestInvite(request, dayPlans, recurringPlans)
    if (invitation.kind !== 'invite') return
    const planId = sendJoinRequestInvite(invitation)
    analytics.capture('buddy_join_request_answered', { action: 'invited' })

    if (planId === dayPlan?.id) return
    if (onOpenPlan) onOpenPlan({ dayPlanId: planId })
    else navigation.replace('Plan Details', { dayPlanId: planId })
  }

  const rowCount = invited.length + former.length + asking.length
  const isLast = (index: number) =>
    index === rowCount - 1 && uninvited.length === 0
  const statusText = {
    color: theme.colors.textAlt,
    fontSize: theme.fontSize('sm'),
  }

  return (
    <BuddiesSection title={i18n.t('buddies_title')}>
      {invited.map((buddy, index) => {
        const reply = replies?.[buddy.inboxId]?.status
        const notSent = unsent?.[buddy.inboxId]
        if (notSent)
          return (
            <ShareBuddyRow
              key={buddy.inboxId}
              buddy={buddy}
              subtitle={notSentReason(notSent)}
              status={<NotSentLabel />}
              last={isLast(index)}
            />
          )
        return (
          <ShareBuddyRow
            key={buddy.inboxId}
            buddy={buddy}
            badge={<ShareReplyBadge status={reply} />}
            status={
              <Text
                style={{
                  ...statusText,
                  color:
                    reply === 'going'
                      ? theme.colors.accent
                      : theme.colors.textAlt,
                }}
              >
                {shareReplyLabel(reply)}
              </Text>
            }
            last={isLast(index)}
          />
        )
      })}
      {former.map(({ inboxId, entry }, index) => (
        <FormerBuddyRow
          key={inboxId}
          entry={entry}
          last={isLast(invited.length + index)}
        />
      ))}
      {asking.map(({ buddy, request }, index) => (
        <ShareBuddyRow
          key={buddy.inboxId}
          buddy={buddy}
          status={
            <Text style={statusText}>{i18n.t('planDetails_askedToJoin')}</Text>
          }
          action={
            <Button
              onPress={() => inviteAsker(request)}
              accessibilityLabel={`${i18n.t('buddies_joinRequestInvite')}, ${buddyDisplayName(buddy)}`}
              style={{
                backgroundColor: theme.colors.accent,
                borderRadius: theme.numbers.borderRadiusSm,
                paddingVertical: 6,
                paddingHorizontal: 14,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textInverse,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('buddies_joinRequestInvite')}
              </Text>
            </Button>
          }
          last={isLast(invited.length + former.length + index)}
        />
      ))}
      {uninvited.length > 0 ? (
        <XView style={{ gap: 6, paddingVertical: 10, paddingHorizontal: 15 }}>
          <PullDownMenu
            accessibilityLabel={i18n.t('buddies_inviteBuddies')}
            pointerEffect='highlight'
            actions={uninvited.map((buddy) => ({
              id: buddy.inboxId,
              title: buddyDisplayName(buddy),
              systemImage: 'person.crop.circle',
              onPress: () => {
                invite(buddy.inboxId)
                onInvited()
              },
            }))}
          >
            <XView style={{ gap: 8, alignSelf: 'flex-start' }}>
              <LucideIcon
                icon={UserPlusIcon}
                size={18}
                color={theme.colors.accent}
              />
              <Text style={{ color: theme.colors.accent }}>
                {i18n.t('buddies_inviteBuddies')}
              </Text>
            </XView>
          </PullDownMenu>
        </XView>
      ) : null}
    </BuddiesSection>
  )
}

const notSentReason = (entry: UnsentShare) =>
  i18n.t(
    entry.reason === 'suspended'
      ? 'buddies_notSentSuspendedRow'
      : 'buddies_notSentGoneRow'
  )

function NotSentLabel() {
  const theme = useTheme()
  return (
    <Text style={{ color: theme.colors.error, fontSize: theme.fontSize('sm') }}>
      {i18n.t('buddies_notSent')}
    </Text>
  )
}

function FormerBuddyRow({
  entry,
  last,
}: {
  entry: UnsentShare
  last: boolean
}) {
  const theme = useTheme()
  return (
    <XView
      accessible
      style={{
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <BuddyAvatar name={entry.name} size={32} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{entry.name}</Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {notSentReason(entry)}
        </Text>
      </View>
      <NotSentLabel />
    </XView>
  )
}
