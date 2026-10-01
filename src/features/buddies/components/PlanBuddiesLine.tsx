import Text from '@/components/ui/MyText'
import AvatarGroup, { AvatarGroupCount } from '@/components/ui/AvatarGroup'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { DayPlan } from '@/types/timeEntry'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import ShareReplyBadge from '@/features/buddies/components/ShareReplyBadge'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import { planShareKey } from '@/features/buddies/lib/shares'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

/** Past this many people, the last avatar slot becomes a "+N" count. */
const MAX_AVATARS = 4

/**
 * Who a Plan is with: the buddies it invites (each badged with their answer),
 * or the buddy whose Plan it follows.
 */
export default function PlanBuddiesLine({ plan }: { plan: DayPlan }) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const replies = useShareReplies(
    plan.buddies?.length ? planShareKey(plan.id) : undefined
  )
  if (!enabled) return null

  const people: {
    buddy: (typeof buddies)[number]
    reply?: ShareReply
  }[] = plan.buddyShare
    ? buddies
        .filter((buddy) => buddy.inboxId === plan.buddyShare?.from)
        .map((buddy) => ({ buddy }))
    : buddies
        .filter((buddy) => plan.buddies?.includes(buddy.inboxId))
        .map((buddy) => ({
          buddy,
          reply: replies?.[buddy.inboxId]?.status,
        }))
  if (people.length === 0) return null

  const visible =
    people.length > MAX_AVATARS ? people.slice(0, MAX_AVATARS - 1) : people
  const overflow = people.length - visible.length
  const names = people.map(({ buddy }) => buddy.name).join(', ')
  const accessibilityLabel = plan.buddyShare
    ? i18n.t('buddies_withName', { name: names })
    : people
        .map(({ buddy, reply }) =>
          [
            buddy.name,
            i18n.t(
              reply === 'going'
                ? 'buddies_replyGoing'
                : reply === 'declined'
                  ? 'buddies_replyDeclined'
                  : 'buddies_replyInvited'
            ),
          ].join(', ')
        )
        .join('; ')

  return (
    <XView
      style={{ gap: 8 }}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <AvatarGroup size={24}>
        {visible.map(({ buddy, reply }) => (
          <BuddyAvatar
            key={buddy.inboxId}
            avatar={buddy.avatar}
            name={buddy.name}
            colorIndex={buddy.colorIndex}
          >
            <ShareReplyBadge status={reply} />
          </BuddyAvatar>
        ))}
        {overflow > 0 ? <AvatarGroupCount count={overflow} /> : null}
      </AvatarGroup>
      <Text
        style={{ fontSize: theme.fontSize('sm'), flexShrink: 1 }}
        numberOfLines={1}
      >
        {plan.buddyShare ? i18n.t('buddies_withName', { name: names }) : names}
      </Text>
    </XView>
  )
}
