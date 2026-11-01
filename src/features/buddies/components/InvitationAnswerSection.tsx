import { View } from 'react-native'
import { Check as CheckIcon, X as XIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import Avatar from '@/components/ui/Avatar'
import AvatarGroup, { AvatarGroupCount } from '@/components/ui/AvatarGroup'
import Button from '@/components/ui/Button'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import { useProfile } from '@/stores/profile'
import type { RootStackNavigation } from '@/types/rootStack'
import type { BuddyShareRef } from '@/types/timeEntry'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import ShareReplyBadge from '@/features/buddies/components/ShareReplyBadge'
import useBuddiesCardName from '@/features/buddies/hooks/useBuddiesCardName'
import useReplyDelivery from '@/features/buddies/hooks/useReplyDelivery'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { type WhosGoing, whosGoing } from '@/features/buddies/lib/guests'
import type { ShareReply } from '@/features/buddies/lib/schemas'
import {
  type Buddy,
  incomingShareKey,
  type IncomingShare,
  type IncomingShareStatus,
} from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export type ShareAnswering = {
  busy: boolean
  answer: (share: BuddyShareRef, reply: ShareReply) => void
}

export default function InvitationAnswerSection({
  from,
  share,
  status,
  answering,
}: {
  from: string
  share?: IncomingShare
  status: Exclude<IncomingShareStatus, 'cancelled'>
  answering: ShareAnswering
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const buddy = useBuddies((state) =>
    state.buddies.find((candidate) => candidate.inboxId === from)
  )
  const buddies = useBuddies((state) => state.buddies)

  const delivery = useReplyDelivery(
    share ? incomingShareKey(share.from, share.shareId) : undefined
  )
  if (!buddy) return null

  return (
    <BuddiesSection
      title={i18n.t('planDetails_whosGoing')}
      footer={
        share?.type === 'plan'
          ? i18n.t('planDetails_invitedSeeWhosGoing')
          : undefined
      }
    >
      <WhosGoingRow
        organizer={buddy}
        going={whosGoing(share, status, buddies)}
        onPress={() =>
          share
            ? navigation.navigate('Going List', {
                from: share.from,
                shareId: share.shareId,
              })
            : navigation.navigate('Buddy', { inboxId: buddy.inboxId })
        }
        last={!share}
      />
      {share ? (
        <YourAnswerRow
          status={status}
          delivery={delivery}
          busy={answering.busy}
          onAnswer={(reply) => {
            if (reply !== status) answering.answer(share, reply)
          }}
        />
      ) : null}
    </BuddiesSection>
  )
}

const MAX_AVATARS = 4

function WhosGoingRow({
  organizer,
  going,
  onPress,
  last,
}: {
  organizer: Buddy
  going: WhosGoing
  onPress: () => void
  last: boolean
}) {
  const theme = useTheme()
  const name = buddyDisplayName(organizer)

  const faces = [
    <BuddyAvatar
      key='organizer'
      avatar={organizer.avatar}
      name={name}
      color={organizer}
    />,
    ...going.guests.map((guest) =>
      guest.kind === 'buddy' ? (
        <BuddyAvatar
          key={guest.buddy.inboxId}
          avatar={guest.buddy.avatar}
          name={buddyDisplayName(guest.buddy)}
          color={guest.buddy}
        />
      ) : (
        <BuddyAvatar
          key={guest.guest.t}
          avatar={guest.guest.a}
          name={guest.guest.n}
        />
      )
    ),
  ]

  const others = 1 + going.guests.length + going.more
  const shown = others > MAX_AVATARS ? faces.slice(0, MAX_AVATARS - 1) : faces
  const overflow = others - shown.length

  const alone = going.count === 1
  const title = alone
    ? name
    : i18n.t('planDetails_goingCount' as TranslationKey, {
        count: going.count,
      })
  const subtitle = alone
    ? i18n.t('planDetails_organizer')
    : i18n.t('planDetails_organizedBy', { name })

  return (
    <Button
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={`${title}, ${subtitle}`}
      accessibilityHint={i18n.t('planDetails_whosGoingHint')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <AvatarGroup size={32}>
        {shown}
        {overflow > 0 ? <AvatarGroupCount count={overflow} /> : null}
      </AvatarGroup>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{title}</Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {subtitle}
        </Text>
      </View>
      <LucideIcon
        icon={ChevronForwardIcon}
        size={18}
        color={theme.colors.textAlt}
      />
    </Button>
  )
}

function YourAnswerRow({
  status,
  delivery,
  busy,
  onAnswer,
}: {
  status: Exclude<IncomingShareStatus, 'cancelled'>
  delivery: ReturnType<typeof useReplyDelivery>
  busy: boolean
  onAnswer: (reply: ShareReply) => void
}) {
  const theme = useTheme()
  const { avatar, customAvatarBackground } = useProfile()
  const name = useBuddiesCardName()
  const answer = status === 'pending' ? undefined : status
  const note = { color: theme.colors.textAlt, fontSize: theme.fontSize('sm') }
  return (
    <XView
      style={{
        gap: 12,
        paddingVertical: 10,
        paddingLeft: 15,

        paddingRight: 9,
      }}
    >
      <Avatar
        avatar={avatar}
        name={name}
        background={customAvatarBackground ?? undefined}
        size={32}
      >
        <ShareReplyBadge status={answer} />
      </Avatar>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{i18n.t('buddies_you')}</Text>
        {delivery.label ? (
          <XView style={{ gap: 6 }}>
            <Text numberOfLines={1} style={{ ...note, flexShrink: 1 }}>
              {delivery.label}
            </Text>
            {delivery.retry ? (
              <Button
                onPress={delivery.retry}
                accessibilityRole='button'
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
              >
                <Text
                  style={{
                    ...note,
                    color: theme.colors.accent,
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('buddies_tryAgain')}
                </Text>
              </Button>
            ) : null}
          </XView>
        ) : null}
      </View>
      <XView style={{ marginVertical: -6 }}>
        <AnswerChoice
          reply='going'
          selected={answer === 'going'}
          disabled={busy}
          onPress={() => onAnswer('going')}
        />
        <AnswerChoice
          reply='declined'
          selected={answer === 'declined'}
          disabled={busy}
          onPress={() => onAnswer('declined')}
        />
      </XView>
    </XView>
  )
}

function AnswerChoice({
  reply,
  selected,
  disabled,
  onPress,
}: {
  reply: ShareReply
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  const theme = useTheme()
  const tint = reply === 'going' ? theme.colors.accent : theme.colors.error
  return (
    <Button
      onPress={onPress}
      disabled={disabled}
      accessibilityRole='button'
      accessibilityLabel={i18n.t(
        reply === 'going' ? 'buddies_going' : 'buddies_cantMakeIt'
      )}
      accessibilityState={{ selected, disabled }}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selected ? 0 : 1.5,
          borderColor: theme.colors.border,
          backgroundColor: selected ? tint : undefined,
        }}
      >
        <LucideIcon
          icon={reply === 'going' ? CheckIcon : XIcon}
          size={18}
          strokeWidth={2.75}
          color={selected ? theme.colors.textInverse : theme.colors.textAlt}
        />
      </View>
    </Button>
  )
}
