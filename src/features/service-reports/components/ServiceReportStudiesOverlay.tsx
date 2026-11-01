import { useNavigation } from '@react-navigation/native'
import { BookOpenCheck as StudyIcon, X as XIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import moment from 'moment'
import { compareText } from '@/lib/collation'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import ContactPreview from '@/components/ContactPreview'
import ContactCard, {
  ContactCardBody,
  ContactCardSubtitle,
} from '@/components/ContactCard'
import ContextMenu from '@/components/ui/ContextMenu'
import Empty from '@/components/ui/Empty'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Pagination from '@/components/ui/Pagination'
import useTheme from '@/contexts/theme'
import ServiceReportInsightOverlay from '@/features/service-reports/components/ServiceReportInsightOverlay'
import { useThisMonthStudies } from '@/features/service-reports/hooks/useThisMonthTotals'
import {
  getMostRecentConversationForContact,
  getStudyContactsForGivenMonth,
} from '@/lib/contacts'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useContactMenuActions from '@/hooks/useContactMenuActions'
import useLocalDay from '@/hooks/useLocalDay'
import { useContactStalenessColor } from '@/hooks/useContactStalenessColor'
import { formatRelative } from '@/lib/dates'
import useConversations from '@/stores/conversationStore'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { RootStackNavigation } from '@/types/rootStack'
import { tracking } from '@/lib/tracking'
import { formatDisplay } from '@/lib/dates'

const PAGE_SIZE = 5

const StudyContactRow = ({
  contact,
  lastVisit,
  onPress,
  navigateAfterClose,
}: {
  contact: Contact
  lastVisit: Visit | null
  onPress: () => void

  navigateAfterClose: (navigate: () => void) => void
}) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const stripeColor = useContactStalenessColor(contact)
  const actions = useContactMenuActions(contact, {
    onAddVisit: (notAtHome) =>
      navigateAfterClose(() =>
        navigation.navigate('Visit Form', { contactId: contact.id, notAtHome })
      ),
    onEdit: () =>
      navigateAfterClose(() =>
        navigation.navigate('Contact Form', { id: contact.id, edit: true })
      ),
  })

  return (
    <ContextMenu
      actions={actions}
      onPress={onPress}
      accessibilityLabel={i18n.t('serviceReportInsights.openContact', {
        name: contact.name,
      })}
      hoverRadius={theme.numbers.borderRadiusSm}
      preview={<ContactPreview contact={contact} lastVisit={lastVisit} />}
    >
      <ContactCard stripeColor={stripeColor}>
        <ContactCardBody
          contact={contact}
          subtitle={
            <ContactCardSubtitle>
              {lastVisit
                ? formatRelative(lastVisit.date)
                : i18n.t('noRecentConversation_plural')}
            </ContactCardSubtitle>
          }
          trailing={
            <LucideIcon
              icon={ChevronForwardIcon}
              size={16}
              color={theme.colors.textAlt}
            />
          }
        />
      </ContactCard>
    </ContextMenu>
  )
}

const StudiesInsightContent = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const contacts = useContacts((state) => state.contacts)
  const conversations = useConversations((state) => state.conversations)

  const now = moment(useLocalDay(), 'YYYY-MM-DD')
  const studyContacts = getStudyContactsForGivenMonth({
    contacts,
    conversations,
    month: now.toDate(),
  })
  const sortedContacts = [...studyContacts].sort((a, b) =>
    compareText(a.name, b.name)
  )
  const pageCount = Math.max(1, Math.ceil(sortedContacts.length / PAGE_SIZE))
  const [requestedPage, setRequestedPage] = useState(1)
  const page = Math.min(requestedPage, pageCount)
  const pageContacts = sortedContacts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  )

  useEffect(() => {
    setRequestedPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  const navigateAfterClose = (navigate: () => void) => {
    onClose()
    setTimeout(navigate, 150)
  }
  const openContact = (contact: Contact) =>
    navigateAfterClose(() =>
      navigation.navigate('Contact Details', { id: contact.id })
    )

  return (
    <>
      <View style={{ alignItems: 'flex-end' }}>
        <IconButton
          icon={XIcon}
          size='lg'
          onPress={onClose}
          accessibilityLabel={i18n.t('close')}
        />
      </View>

      <View style={{ alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon icon={StudyIcon} size={26} color={theme.colors.accent} />
        </View>
        <Text
          accessibilityRole='header'
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xl'),
          }}
        >
          {i18n.t('serviceReportInsights.studiesTitle')}
        </Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {formatDisplay(now, 'MMMM YYYY')}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('3xl'),
          }}
        >
          {studyContacts.length}
        </Text>
        <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
          {i18n.t('serviceReportInsights.studiesDescription')}
        </Text>
      </View>

      {pageContacts.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
              textTransform: 'uppercase',
              letterSpacing: tracking(0.5),
            }}
          >
            {i18n.t('serviceReportInsights.studyContacts')}
          </Text>
          <View style={{ gap: 8 }}>
            {pageContacts.map((contact) => (
              <StudyContactRow
                key={contact.id}
                contact={contact}
                lastVisit={getMostRecentConversationForContact({
                  conversations,
                  contact,
                })}
                navigateAfterClose={navigateAfterClose}
                onPress={() => openContact(contact)}
              />
            ))}
          </View>
        </View>
      ) : (
        <Empty title={i18n.t('serviceReportInsights.noStudies')} />
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        onPageChange={setRequestedPage}
      />
    </>
  )
}

interface Props {
  children: ReactNode
  containerStyle?: StyleProp<ViewStyle>
}

const ServiceReportStudiesOverlay = ({ children, containerStyle }: Props) => {
  const studies = useThisMonthStudies()
  return (
    <ServiceReportInsightOverlay
      containerStyle={containerStyle}
      accessibilityLabel={i18n.t('studiesCount', { count: studies })}
      accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
      expandedHeight={560}
      content={({ close }) => <StudiesInsightContent onClose={close} />}
    >
      {children}
    </ServiceReportInsightOverlay>
  )
}

export default ServiceReportStudiesOverlay
