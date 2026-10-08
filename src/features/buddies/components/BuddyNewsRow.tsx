import { useRef } from 'react'
import { View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import { measureBadgeOrigin } from '@/components/badges/BadgeButton'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { SharedBadge } from '@/types/badges'
import type { BadgeViewOrigin } from '@/types/rootStack'
import BadgeReactionBar from '@/features/buddies/components/BadgeReactionBar'
import BuddyAvatar from '@/features/buddies/components/BuddyAvatar'
import { newsWhen, type NewsWhen } from '@/features/buddies/lib/badgeNews'
import { buddyDisplayName } from '@/features/buddies/lib/buddyProfile'
import {
  badgeNewsLine,
  notificationHeadline,
} from '@/features/buddies/lib/notificationText'
import type { BuddyNotification } from '@/features/buddies/lib/state'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

const AVATAR = 36
const GAP = 10
const COIN = 30

const WHEN: Record<NewsWhen, TranslationKey> = {
  today: 'buddies_newsToday',
  thisWeek: 'buddies_newsThisWeek',
  earlier: 'buddies_newsEarlier',
}

/**
 * Buddies' news in the bell: a buddy's new badges, with Encourage right there,
 * or their reaction to one of this User's badges. Says when only as Today, This
 * week, or Earlier. Tapping the row or its coin opens the badge full screen,
 * growing out of the coin; long-press opens or dismisses it.
 */
export default function BuddyNewsRow({
  entry,
  unread,
  now,
  onOpen,
  onDismiss,
  encourage,
}: {
  entry: BuddyNotification
  unread: boolean
  now: number
  /** Opens the row's badge, from the coin's window rect. */
  onOpen: (origin: BadgeViewOrigin | undefined) => void
  onDismiss: () => void
  /** A buddy's badge they still show: Encourage it inline. */
  encourage?: { inboxId: string; badge: SharedBadge }
}) {
  const theme = useTheme()
  const coin = useRef<View>(null)
  const buddy = useBuddies((state) =>
    entry.from ? state.buddies.find((b) => b.inboxId === entry.from) : undefined
  )
  const name = buddy ? buddyDisplayName(buddy) : entry.name
  const title = notificationHeadline({ ...entry, name })
  const badges = badgeNewsLine(entry)
  const when = i18n.t(WHEN[newsWhen(entry.at, now)])
  const [lead] = entry.badges ?? []
  const open = () => measureBadgeOrigin(coin.current, onOpen)

  return (
    <View style={{ gap: 8, paddingVertical: 12, paddingHorizontal: 14 }}>
      <XView style={{ gap: GAP, alignItems: 'flex-start' }}>
        <ContextMenu
          style={{ flex: 1 }}
          onPress={open}
          accessibilityLabel={[title, badges, when].filter(Boolean).join(', ')}
          hoverRadius={theme.numbers.borderRadiusSm}
          actions={[
            {
              id: 'open',
              title: i18n.t('open'),
              systemImage: 'arrow.up.forward.app',
              onPress: open,
            },
            {
              id: 'dismiss',
              title: i18n.t('dismiss'),
              systemImage: 'xmark',
              onPress: onDismiss,
            },
          ]}
        >
          <XView style={{ gap: GAP, alignItems: 'center' }}>
            <View>
              <BuddyAvatar
                avatar={buddy?.avatar}
                name={name}
                color={buddy}
                size={AVATAR}
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
            <View style={{ flex: 1, flexShrink: 1, gap: 2 }}>
              <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
              {badges ? <Text>{badges}</Text> : null}
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {when}
              </Text>
            </View>
            {lead ? (
              <View
                ref={coin}
                collapsable={false}
                accessibilityElementsHidden
                importantForAccessibility='no-hide-descendants'
              >
                <BadgeMedallion
                  art={lead.c}
                  level={lead.l ?? null}
                  size={COIN}
                />
              </View>
            ) : null}
          </XView>
        </ContextMenu>
        <IconButton
          icon={XIcon}
          size={16}
          hitSlop={12}
          style={{ paddingTop: 10 }}
          accessibilityLabel={i18n.t('dismiss')}
          onPress={onDismiss}
        />
      </XView>
      {encourage ? (
        <View style={{ paddingLeft: AVATAR + GAP }}>
          <BadgeReactionBar
            inboxId={encourage.inboxId}
            badge={encourage.badge}
            name={name}
            placement='bell'
          />
        </View>
      ) : null}
    </View>
  )
}
