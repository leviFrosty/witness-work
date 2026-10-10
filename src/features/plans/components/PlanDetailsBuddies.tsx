import moment from 'moment'
import { useNavigation } from '@react-navigation/native'
import { UserPlus as UserPlusIcon } from 'lucide-react-native'
import type { PlanListItem } from '@/types/timeEntry'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { storedDayKey } from '@/lib/normalizeDate'
import useServiceReport from '@/stores/serviceReport'
import type { RootStackNavigation } from '@/types/rootStack'
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
import type { IncomingJoinRequest } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import ShareBuddyRow from '@/features/buddies/components/ShareBuddyRow'

/**
 * Who's invited to the User's own Plan and how each answered, buddies asking to
 * join it (with Invite), and Invite Buddies while the Plan is still ahead.
 * Inviting adds the buddy right away; the invitation goes out like saving the
 * Plan would. Taking someone off stays in Edit.
 */
export default function PlanDetailsBuddies({
  item,
  now,
  onInvited,
}: {
  item: PlanListItem
  now: number
  /** Invite Buddies added someone. */
  onInvited: () => void
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
  // Only its organizer invites people to a Plan that follows an invitation.
  if (!enabled || dayPlan?.buddyShare) return null

  const invitedIds = dayPlan?.buddies ?? []
  const invited = buddies.filter((buddy) => invitedIds.includes(buddy.inboxId))
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
  if (invited.length + asking.length + uninvited.length === 0) return null

  const invite = (inboxId: string) => {
    if (!dayPlan) return
    updateDayPlan({ id: dayPlan.id, buddies: [...invitedIds, inboxId] })
  }

  const inviteAsker = (request: IncomingJoinRequest) => {
    const invitation = joinRequestInvite(request, dayPlans, recurringPlans)
    if (invitation.kind !== 'invite') return
    const planId = sendJoinRequestInvite(invitation)
    analytics.capture('buddy_join_request_answered', { action: 'invited' })
    // A Recurring Plan's date became a one-time Plan carrying the invitation.
    if (planId !== dayPlan?.id)
      navigation.replace('Plan Details', { dayPlanId: planId })
  }

  const rowCount = invited.length + asking.length
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
          last={isLast(invited.length + index)}
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
          {/* Inviting sends right away, so say what goes with it. */}
          <InfoPopover
            title={i18n.t('buddies_inviteBuddies')}
            description={i18n.t('buddies_invitePlanDescription')}
          />
        </XView>
      ) : null}
    </BuddiesSection>
  )
}
