import { useMemo } from 'react'
import { View } from 'react-native'
import { BookOpenCheck as StudyIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import i18n from '@/lib/locales'

export default function StudiesCard() {
  const theme = useTheme()
  const { contacts } = useContacts()
  const { conversations } = useConversations()
  const studies = useMemo(
    () =>
      getStudiesForGivenMonth({ contacts, conversations, month: new Date() }),
    [contacts, conversations]
  )

  return (
    <View
      style={{
        flex: 1,
        minHeight: 64,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 6,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontSize: theme.fontSize('3xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {studies}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon icon={StudyIcon} size={14} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('studies')}
        </Text>
      </View>
    </View>
  )
}
