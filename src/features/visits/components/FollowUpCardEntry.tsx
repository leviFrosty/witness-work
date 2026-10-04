import {
  CalendarClock as CalendarClockIcon,
  CircleCheck as CircleCheckIcon,
  DoorClosed as DoorClosedIcon,
  MapPin as MapPinIcon,
  MessageSquareText as MessageSquareTextIcon,
  MessagesSquare as MessagesSquareIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import ContactPreview from '@/components/ContactPreview'
import { addressToString, navigateTo } from '@/lib/address'
import { analytics } from '@/lib/analytics'
import { formatCalendar, formatRelative } from '@/lib/dates'
import type { FollowUpCardItem } from '@/lib/conversations'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'
import useDismissFollowUp from '@/features/visits/hooks/useDismissFollowUp'

type Props = {
  item: FollowUpCardItem
  width: number
  onNotAtHome: (item: FollowUpCardItem) => void
}

/** One Follow-up on Home's card: who, when, and what happened. */
export default function FollowUpCardEntry({ item, width, onNotAtHome }: Props) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const dismissFollowUp = useDismissFollowUp()
  const dataProtectionMode = usePreferences((s) => s.dataProtectionMode)
  const defaultNavigationMapProvider = usePreferences(
    (s) => s.defaultNavigationMapProvider
  )
  const { visit, answeredBy } = item
  const contact = useContacts((s) =>
    s.contacts.find((c) => c.id === visit.contact.id)
  )

  if (!contact || !visit.followUp) return null

  const followUpDate = moment(visit.followUp.date)
  const isToday = followUpDate.isSame(moment(), 'day')
  const address = addressToString(contact.address)
  const phone = contact.phone
    ? parsePhoneNumber(contact.phone, {
        regionCode:
          contact.phoneRegionCode || getLocales()[0]?.regionCode || '',
      })
    : null

  const when = followUpDate.isAfter(moment())
    ? `${formatCalendar(followUpDate)} · ${formatRelative(followUpDate)}`
    : formatCalendar(followUpDate)

  const openContact = () =>
    navigation.navigate('Contact Details', {
      id: contact.id,
      highlightedVisitId: answeredBy?.id ?? visit.id,
    })
  const talked = () => {
    analytics.capture('follow_up_card_action', { action: 'talked' })
    navigation.navigate('Visit Form', {
      contactId: contact.id,
      returnOnSave: true,
    })
  }
  const reschedule = () => {
    analytics.capture('follow_up_card_action', { action: 'reschedule' })
    navigation.navigate('RescheduleVisit', {
      contactId: contact.id,
      visitId: visit.id,
    })
  }

  // The tap action (the contact) isn't repeated in the menu.
  const actions: ContextMenuEntries = [
    [
      phone && {
        id: 'call',
        title: i18n.t('call'),
        systemImage: 'phone',
        onPress: () => handleCall(contact, phone, navigation),
      },
      phone && {
        id: 'message',
        title: i18n.t('message'),
        systemImage: 'message',
        onPress: () => handleMessage(contact, phone, navigation),
      },
      (!!address || !!contact.coordinate) && {
        id: 'navigate',
        title: i18n.t('navigate'),
        systemImage: 'arrow.triangle.turn.up.right.diamond',
        onPress: () => navigateTo(contact, defaultNavigationMapProvider),
      },
      {
        id: 'reschedule',
        title: i18n.t('rescheduleEllipsis'),
        systemImage: 'calendar',
        onPress: reschedule,
      },
    ],
    [
      !answeredBy && {
        id: 'dismiss_follow_up',
        title: i18n.t('dismissFollowUpAction'),
        systemImage: 'bell.slash',
        onPress: () => dismissFollowUp(visit),
      },
    ],
  ]

  const detail = (icon: AppIcon, text: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LucideIcon icon={icon} size={14} color={theme.colors.textAlt} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {text}
      </Text>
    </View>
  )

  const buttonStyle = {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: theme.numbers.borderRadiusSm,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
  }
  const secondaryButtonStyle = {
    ...buttonStyle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  }
  const buttonLabelStyle = {
    fontFamily: theme.fonts.semiBold,
    fontSize: theme.fontSize('sm'),
  }

  const footer = (() => {
    if (answeredBy) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LucideIcon
            icon={CircleCheckIcon}
            size={18}
            color={theme.colors.accent}
          />
          <Text style={{ ...buttonLabelStyle, flex: 1 }} numberOfLines={1}>
            {i18n.t(
              answeredBy.notAtHome
                ? 'followUpCard_notAtHomeLogged'
                : 'followUpCard_conversationLogged'
            )}
          </Text>
          {answeredBy.notAtHome && (
            <Button onPress={reschedule} hitSlop={8}>
              <Text style={{ ...buttonLabelStyle, color: theme.colors.accent }}>
                {i18n.t('reschedule')}
              </Text>
            </Button>
          )}
        </View>
      )
    }
    if (!isToday) {
      return (
        <Button onPress={reschedule} style={secondaryButtonStyle}>
          <LucideIcon
            icon={CalendarClockIcon}
            size={16}
            color={theme.colors.text}
          />
          <Text style={buttonLabelStyle}>{i18n.t('reschedule')}</Text>
        </Button>
      )
    }
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          onPress={talked}
          style={{
            ...buttonStyle,
            flex: 1,
            backgroundColor: theme.colors.accent,
          }}
        >
          <LucideIcon
            icon={MessagesSquareIcon}
            size={16}
            color={theme.colors.textInverse}
          />
          <Text
            numberOfLines={1}
            style={{ ...buttonLabelStyle, color: theme.colors.textInverse }}
          >
            {i18n.t('followUpCard_talked')}
          </Text>
        </Button>
        {/* Data protection mode drops not-at-home records entirely. */}
        {!dataProtectionMode && (
          <Button
            onPress={() => onNotAtHome(item)}
            style={{ ...secondaryButtonStyle, flex: 1 }}
          >
            <LucideIcon
              icon={DoorClosedIcon}
              size={16}
              color={theme.colors.text}
            />
            <Text numberOfLines={1} style={buttonLabelStyle}>
              {i18n.t('notAtHome')}
            </Text>
          </Button>
        )}
        <Button
          onPress={reschedule}
          accessibilityLabel={i18n.t('reschedule')}
          style={{ ...secondaryButtonStyle, width: 44, paddingHorizontal: 0 }}
        >
          <LucideIcon
            icon={CalendarClockIcon}
            size={18}
            color={theme.colors.text}
          />
        </Button>
      </View>
    )
  })()

  return (
    <View
      style={{
        width,
        padding: 14,
        gap: 12,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {/* The buttons stay outside so the long press has no rivals. */}
        <ContextMenu
          actions={actions}
          analyticsSurface='follow_up_card'
          onPress={openContact}
          accessibilityLabel={contact.name}
          preview={<ContactPreview contact={contact} lastVisit={visit} />}
          style={{ flex: 1, minWidth: 0 }}
        >
          <View style={{ gap: 12 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <Avatar
                avatar={contact.avatar ?? { type: 'none', value: '' }}
                name={contact.name}
                size={40}
                background={contact.avatarBackground ?? undefined}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    fontSize: theme.fontSize('md'),
                  }}
                >
                  {contact.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {when}
                </Text>
              </View>
            </View>
            {!!visit.followUp.topic &&
              detail(MessageSquareTextIcon, visit.followUp.topic)}
            {!!address && detail(MapPinIcon, address)}
          </View>
        </ContextMenu>
        <PullDownMenu
          actions={actions}
          analyticsSurface='follow_up_card'
          accessibilityLabel={i18n.t('more')}
          style={{ height: 40, justifyContent: 'center' }}
        />
      </View>
      <View style={{ flex: 1 }} />
      {footer}
    </View>
  )
}
