import { View } from 'react-native'
import { UserPlus as UserPlusIcon } from 'lucide-react-native'
import AvatarGroup, { AvatarGroupCount } from '@/components/ui/AvatarGroup'
import EmphasizedText from '@/components/ui/EmphasizedText'
import InfoPopover from '@/components/ui/InfoPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import ShareReplyBadge, {
  shareReplyLabel,
} from '@/features/buddies/components/ShareReplyBadge'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import useShareReplies from '@/features/buddies/hooks/useShareReplies'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { followUpGoingSentences } from '@/features/buddies/lib/followUpGoing'
import { followUpShareKey } from '@/features/buddies/lib/shares'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const AVATAR = 30
/** Past this many people, the last avatar slot becomes a "+N" count. */
const MAX_AVATARS = 4

/**
 * Who's going on a Follow-up, inside Visit Details' next stop: the invited
 * buddies' photos stacked with their answers, a sentence per answer ("Anna is
 * going with you. Marco hasn't answered."), and Invite while it's still ahead.
 * Inviting adds the buddy right away; the invitation goes out like saving the
 * visit form would. Taking someone off stays in Edit. Nothing for a dismissed
 * Follow-up, which isn't shared.
 */
export default function FollowUpDetailsBuddies({
  visit,
  now,
  onInvited,
  surface,
}: {
  visit: Visit
  now: number
  /** Invite added someone. */
  onInvited: () => void
  /** The card's color behind the avatars, for the rings between them. */
  surface: string
}) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const buddies = useBuddies((state) => state.buddies)
  const updateConversation = useConversations((s) => s.updateConversation)
  const followUp = visit.followUp
  const invitedIds = followUp?.buddies ?? []
  const replies = useShareReplies(
    invitedIds.length > 0 ? followUpShareKey(visit.id) : undefined
  )
  if (!enabled || !followUp || followUp.dismissed) return null

  const invited = buddies.filter((buddy) => invitedIds.includes(buddy.inboxId))
  const uninvited =
    new Date(followUp.date).getTime() > now
      ? buddies.filter(
          (buddy) =>
            buddy.status === 'active' && !invitedIds.includes(buddy.inboxId)
        )
      : []
  if (invited.length + uninvited.length === 0) return null

  const invite = (inboxId: string) => {
    // The latest record: a reply or another device may have changed it.
    const latest = useConversations
      .getState()
      .conversations.find((c) => c.id === visit.id)
    if (!latest?.followUp) return
    updateConversation({
      ...latest,
      followUp: {
        ...latest.followUp,
        buddies: [...(latest.followUp.buddies ?? []), inboxId],
      },
    })
    onInvited()
  }

  const people = invited.map((buddy) => ({
    buddy,
    name: buddyDisplayName(buddy),
    reply: replies?.[buddy.inboxId]?.status,
  }))
  const visible =
    people.length > MAX_AVATARS ? people.slice(0, MAX_AVATARS - 1) : people
  const overflow = people.length - visible.length
  const sentences = followUpGoingSentences(people)
  const sentenceStyle = {
    fontSize: theme.fontSize('sm') + 1,
    lineHeight: 19,
    color: theme.colors.textAlt,
  }

  return (
    <View
      style={{
        gap: 8,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: withAlpha(theme.colors.text, 0x14),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {people.length > 0 ? (
          <View
            accessible
            accessibilityLabel={people
              .map(({ name, reply }) => `${name}, ${shareReplyLabel(reply)}`)
              .join('; ')}
          >
            <AvatarGroup size={AVATAR} ringColor={surface}>
              {visible.map(({ buddy, name, reply }) => (
                <BuddyAvatar
                  key={buddy.inboxId}
                  avatar={buddy.avatar}
                  name={name}
                  color={buddy}
                >
                  <ShareReplyBadge status={reply} ringColor={surface} />
                </BuddyAvatar>
              ))}
              {overflow > 0 ? <AvatarGroupCount count={overflow} /> : null}
            </AvatarGroup>
          </View>
        ) : null}
        {uninvited.length > 0 ? (
          <PullDownMenu
            accessibilityLabel={i18n.t('buddies_inviteBuddies')}
            pointerEffect='highlight'
            actions={uninvited.map((buddy) => ({
              id: buddy.inboxId,
              title: buddyDisplayName(buddy),
              systemImage: 'person.crop.circle',
              onPress: () => invite(buddy.inboxId),
            }))}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: theme.colors.accent3,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LucideIcon
                  icon={UserPlusIcon}
                  size={14}
                  color={theme.colors.accent3}
                />
              </View>
              {invited.length === 0 ? (
                <Text
                  style={{
                    color: theme.colors.accent3,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('buddies_inviteBuddies')}
                </Text>
              ) : null}
            </View>
          </PullDownMenu>
        ) : null}
        {/* Inviting sends right away, so say what goes with it. */}
        {uninvited.length > 0 ? (
          <InfoPopover
            title={i18n.t('buddies_inviteBuddies')}
            description={i18n.t('buddies_inviteFollowUpDescription')}
          />
        ) : null}
      </View>
      {sentences.length > 0 ? (
        <Text style={sentenceStyle}>
          {sentences.map(({ answer, key, values }, index) => (
            <EmphasizedText
              key={answer}
              translate={(marked) =>
                `${index > 0 ? ' ' : ''}${i18n.t(key, marked)}`
              }
              values={values}
              emphasis={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.text,
              }}
              style={sentenceStyle}
            />
          ))}
        </Text>
      ) : null}
    </View>
  )
}
