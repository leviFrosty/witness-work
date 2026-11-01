import type { ReactNode } from 'react'
import { Alert, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n, { type TranslationKey } from '@/lib/locales'
import { useProfile } from '@/stores/profile'
import type { RootStackNavigation } from '@/types/rootStack'
import BuddiesSection from '@/features/buddies/components/BuddiesSection'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import ShareBuddyRow from '@/features/buddies/components/ShareBuddyRow'
import ShareReplyBadge, {
  shareReplyLabel,
} from '@/features/buddies/components/ShareReplyBadge'
import useBuddiesCardName from '@/features/buddies/hooks/useBuddiesCardName'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import type { WhosGoing } from '@/features/buddies/lib/guests'
import type { ShareGuest } from '@/features/buddies/lib/schemas'
import type { Buddy, IncomingShareStatus } from '@/features/buddies/lib/state'

export default function WhosGoingList({
  organizer,
  going,
  status,
}: {
  organizer: Buddy
  going: WhosGoing
  status: Exclude<IncomingShareStatus, 'cancelled'>
}) {
  const theme = useTheme()
  const name = buddyDisplayName(organizer)
  const { guests, more } = going
  const goingLabel = (
    <Text
      style={{ color: theme.colors.accent, fontSize: theme.fontSize('sm') }}
    >
      {i18n.t('buddies_going')}
    </Text>
  )

  return (
    <BuddiesSection>
      <ShareBuddyRow
        buddy={organizer}
        subtitle={i18n.t('planDetails_organizer')}
        action={
          <View style={{ marginRight: -14 }}>
            <InfoPopover
              centered
              title={name}
              description={i18n.t('buddies_sharedBy', { name })}
            />
          </View>
        }
        last={false}
      />
      <YouRow status={status} last={!guests.length && !more} />
      {guests.map((guest, index) => {
        const last = index === guests.length - 1 && !more
        return guest.kind === 'buddy' ? (
          <ShareBuddyRow
            key={guest.buddy.inboxId}
            buddy={guest.buddy}
            badge={<ShareReplyBadge status='going' />}
            status={goingLabel}
            last={last}
          />
        ) : (
          <GuestRow
            key={guest.guest.t}
            guest={guest.guest}
            status={goingLabel}
            last={last}
          />
        )
      })}
      {more ? <MoreGoingRow count={more} /> : null}
    </BuddiesSection>
  )
}

const rowStyle = { gap: 12, paddingVertical: 10, paddingHorizontal: 15 }

function YouRow({
  status,
  last,
}: {
  status: Exclude<IncomingShareStatus, 'cancelled'>
  last: boolean
}) {
  const theme = useTheme()
  const { avatar, customAvatarBackground } = useProfile()
  const name = useBuddiesCardName()
  const answer = status === 'pending' ? undefined : status
  return (
    <XView
      style={{
        ...rowStyle,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
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
      </View>
      <Text
        style={{
          color:
            answer === 'going' ? theme.colors.accent : theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {shareReplyLabel(answer)}
      </Text>
    </XView>
  )
}

function GuestRow({
  guest,
  status,
  last,
}: {
  guest: ShareGuest
  status: ReactNode
  last: boolean
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const explain = () => {
    analytics.capture('buddy_guest_tapped', { action: 'opened' })
    Alert.alert(
      i18n.t('planDetails_guestNotBuddyTitle', { name: guest.n }),
      i18n.t('planDetails_guestNotBuddyBody'),
      [
        { text: i18n.t('ok'), style: 'cancel' },
        {
          text: i18n.t('planDetails_guestShowCode'),
          onPress: () => {
            analytics.capture('buddy_guest_tapped', { action: 'show_code' })
            navigation.navigate('Buddy Code', { mode: 'code' })
          },
        },
      ]
    )
  }
  return (
    <Button
      onPress={explain}
      accessibilityRole='button'
      accessibilityHint={i18n.t('planDetails_guestNotBuddyHint')}
      style={{
        ...rowStyle,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <BuddyAvatar avatar={guest.a} name={guest.n} size={32}>
        <ShareReplyBadge status='going' />
      </BuddyAvatar>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1}>{guest.n}</Text>
      </View>
      {status}
    </Button>
  )
}

function MoreGoingRow({ count }: { count: number }) {
  const theme = useTheme()
  return (
    <XView style={rowStyle}>
      <Avatar avatar={{ type: 'none', value: '' }} size={32}>
        <ShareReplyBadge status='going' />
      </Avatar>
      <Text style={{ flex: 1, color: theme.colors.textAlt }}>
        {i18n.t('planDetails_moreGoing' as TranslationKey, { count })}
      </Text>
    </XView>
  )
}
