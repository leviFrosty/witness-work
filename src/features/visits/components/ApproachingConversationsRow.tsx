import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'
import { useContext } from 'react'
import { View } from 'react-native'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { getLocales } from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import { ThemeContext } from '@/contexts/theme'
import Card from '@/components/ui/Card'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import ContactPreview from '@/components/ContactPreview'
import { Visit } from '@/types/visit'
import useContacts from '@/stores/contactsStore'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import { handleCall, handleMessage } from '@/lib/phone'
import { RootStackNavigation } from '@/types/rootStack'
import useDismissFollowUp from '@/features/visits/hooks/useDismissFollowUp'

const ApproachingConversationRow = ({
  conversation,
}: {
  conversation: Visit
}) => {
  const theme = useContext(ThemeContext)
  const contact = useContacts((s) =>
    s.contacts.find((c) => c.id === conversation.contact.id)
  )
  const navigation = useNavigation<RootStackNavigation>()
  const dismissFollowUp = useDismissFollowUp()

  if (!contact) {
    return
  }

  const phone = contact.phone
    ? parsePhoneNumber(contact.phone, {
        regionCode:
          contact.phoneRegionCode || getLocales()[0]?.regionCode || '',
      })
    : null

  const openContact = () =>
    navigation.navigate('Contact Details', {
      id: contact.id,
      highlightedVisitId: conversation.id,
    })
  const reschedule = () =>
    navigation.navigate('RescheduleVisit', {
      contactId: contact.id,
      visitId: conversation.id,
    })

  // The row's tap action (the contact) isn't repeated in its menu.
  const actions: ContextMenuEntries = [
    [
      {
        id: 'log_visit',
        title: i18n.t('logVisitAction'),
        systemImage: 'square.and.pencil',
        onPress: () =>
          navigation.navigate('Visit Form', { contactId: contact.id }),
      },
      {
        id: 'reschedule',
        title: i18n.t('rescheduleEllipsis'),
        systemImage: 'calendar',
        onPress: reschedule,
      },
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
    ],
    [
      {
        id: 'dismiss_follow_up',
        title: i18n.t('dismissFollowUpAction'),
        systemImage: 'bell.slash',
        onPress: () => dismissFollowUp(conversation),
      },
    ],
  ]

  return (
    <ContextMenu
      actions={actions}
      analyticsSurface='follow_up_row'
      onPress={openContact}
      preview={<ContactPreview contact={contact} lastVisit={conversation} />}
    >
      <Card
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          paddingVertical: 12,
          gap: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }} numberOfLines={1}>
            {contact.name}
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
            numberOfLines={2}
          >
            {formatRelative(conversation.followUp?.date)}
            {conversation.followUp?.topic
              ? ` · ${conversation.followUp.topic}`
              : ''}
          </Text>
        </View>
        <LucideIcon
          icon={ChevronRightIcon}
          size={theme.fontSize('md')}
          color={theme.colors.textAlt}
        />
      </Card>
    </ContextMenu>
  )
}

export default ApproachingConversationRow
