import { useNavigation } from '@react-navigation/native'
import {
  BookOpenCheck as StudyIcon,
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from 'lucide-react-native'
import moment from 'moment'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Pagination from '@/components/ui/Pagination'
import useTheme from '@/contexts/theme'
import ServiceReportInsightOverlay from '@/features/service-reports/components/ServiceReportInsightOverlay'
import { getStudyContactsForGivenMonth } from '@/lib/contacts'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import type { Contact } from '@/types/contact'
import type { RootStackNavigation } from '@/types/rootStack'

const PAGE_SIZE = 5

const StudyContactRow = ({
  contact,
  last,
  onPress,
}: {
  contact: Contact
  last: boolean
  onPress: () => void
}) => {
  const theme = useTheme()

  return (
    <Button
      noTransform
      onPress={onPress}
      accessibilityLabel={i18n.t('serviceReportInsights.openContact', {
        name: contact.name,
      })}
      style={{
        minHeight: 52,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Avatar
        avatar={contact.avatar ?? { type: 'none', value: '' }}
        name={contact.name}
        size={36}
        background={contact.avatarBackground ?? undefined}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {contact.name}
      </Text>
      <LucideIcon
        icon={ChevronRightIcon}
        size={16}
        color={theme.colors.textAlt}
      />
    </Button>
  )
}

const StudiesInsightContent = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const contacts = useContacts((state) => state.contacts)
  const conversations = useConversations((state) => state.conversations)
  const now = moment()
  const studyContacts = getStudyContactsForGivenMonth({
    contacts,
    conversations,
    month: now.toDate(),
  })
  const sortedContacts = [...studyContacts].sort((a, b) =>
    a.name.localeCompare(b.name)
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

  const openContact = (contact: Contact) => {
    onClose()
    setTimeout(
      () => navigation.navigate('Contact Details', { id: contact.id }),
      150
    )
  }

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
          {now.format('MMMM YYYY')}
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
              letterSpacing: 0.5,
            }}
          >
            {i18n.t('serviceReportInsights.studyContacts')}
          </Text>
          <View>
            {pageContacts.map((contact, index) => (
              <StudyContactRow
                key={contact.id}
                contact={contact}
                last={index === pageContacts.length - 1}
                onPress={() => openContact(contact)}
              />
            ))}
          </View>
        </View>
      ) : (
        <View
          style={{
            padding: 18,
            borderRadius: theme.numbers.borderRadiusMd,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <Text style={{ color: theme.colors.textAlt, textAlign: 'center' }}>
            {i18n.t('serviceReportInsights.noStudies')}
          </Text>
        </View>
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

const ServiceReportStudiesOverlay = ({ children, containerStyle }: Props) => (
  <ServiceReportInsightOverlay
    containerStyle={containerStyle}
    accessibilityLabel={i18n.t('serviceReportInsights.openStudies')}
    accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
    expandedHeight={560}
    content={({ close }) => <StudiesInsightContent onClose={close} />}
  >
    {children}
  </ServiceReportInsightOverlay>
)

export default ServiceReportStudiesOverlay
