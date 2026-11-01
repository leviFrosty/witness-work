import { useRef, useState } from 'react'
import { View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { MIN_TOUCH_TARGET, touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import Haptics from '@/lib/haptics'
import i18n, { type TranslationKey } from '@/lib/locales'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import { notificationHeadline } from '@/features/buddies/lib/notificationText'
import type { BuddyNotification } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'
import {
  declineCarInvite,
  joinCarInvite,
} from '@/app/sharedCars/answerCarInvite'

export type CarInviteAnswer = 'open' | 'joined' | 'declined'

const dismissFrame = {
  ...touchTargetFrame(16),
  marginTop: Number(touchTargetFrame(16).marginVertical) + 10,
}

export default function SharedCarNotificationRow({
  entry,
  answer,
  people,
  car,
  unread,
  onPress,
  onDismiss,
  onJoined,
}: {
  entry: BuddyNotification

  answer?: CarInviteAnswer

  people?: number

  car?: string
  unread: boolean

  onPress?: () => void

  onDismiss?: () => void

  onJoined: () => void
}) {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)

  const answering = useRef(false)
  const buddy = useBuddies((state) =>
    entry.from ? state.buddies.find((b) => b.inboxId === entry.from) : undefined
  )
  const name = buddy ? buddyDisplayName(buddy) : entry.name
  const title = notificationHeadline({ ...entry, name }, { car })
  const shareKey = answer === 'open' ? entry.shareKey : undefined
  const peopleLine =
    people !== undefined && people > 0
      ? i18n.t('buddies_carPeople' as TranslationKey, { count: people })
      : undefined
  const answered =
    answer === 'joined'
      ? i18n.t('buddies_carAnsweredJoined')
      : answer === 'declined'
        ? i18n.t('buddies_carAnsweredDeclined')
        : undefined

  const respond = async (key: string, choice: 'join' | 'decline') => {
    if (answering.current) return
    answering.current = true
    setBusy(true)
    try {
      if (choice === 'decline') {
        await declineCarInvite(key)
        return
      }
      if (await joinCarInvite(key)) {
        void Haptics.success()
        onJoined()
      }
    } finally {
      answering.current = false
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}>
      <XView style={{ gap: 10, alignItems: 'flex-start' }}>
        <ContextMenu
          style={{ flex: 1 }}
          onPress={onPress}
          accessibilityLabel={[title, peopleLine].filter(Boolean).join(', ')}
          hoverRadius={theme.numbers.borderRadiusSm}
          actions={[
            onPress && {
              id: 'open',
              title: i18n.t('open'),
              systemImage: 'arrow.up.forward.app',
              onPress,
            },
            onDismiss && {
              id: 'dismiss',
              title: i18n.t('dismiss'),
              systemImage: 'xmark',
              onPress: onDismiss,
            },
          ]}
        >
          <XView style={{ gap: 10, alignItems: 'center' }}>
            <View>
              <BuddyAvatar
                avatar={buddy?.avatar}
                name={name}
                color={buddy}
                size={36}
              />
              {unread && (
                <View
                  accessibilityElementsHidden
                  style={{
                    position: 'absolute',
                    top: -2,
                    left: -2,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    borderWidth: 1.5,
                    borderColor: theme.colors.card,
                    backgroundColor: theme.colors.accent,
                  }}
                />
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {[peopleLine, formatRelative(entry.at)]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </XView>
        </ContextMenu>
        {onDismiss ? (
          <IconButton
            icon={XIcon}
            size={16}
            style={dismissFrame}
            accessibilityLabel={i18n.t('dismiss')}
            onPress={onDismiss}
          />
        ) : null}
      </XView>

      {shareKey ? (
        <XView style={{ gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ActionButton
              disabled={busy}
              onPress={() => void respond(shareKey, 'join')}
            >
              {i18n.t('buddies_carJoin')}
            </ActionButton>
          </View>
          <Button
            disabled={busy}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              justifyContent: 'center',
              paddingHorizontal: 12,
            }}
            onPress={() => void respond(shareKey, 'decline')}
          >
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('buddies_carDecline')}
            </Text>
          </Button>
        </XView>
      ) : answered ? (
        <Text style={{ color: theme.colors.textAlt }}>{answered}</Text>
      ) : null}
    </View>
  )
}
