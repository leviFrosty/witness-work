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
        minHeight: 92,
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: 8,
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.accentTranslucent,
        }}
      >
        <LucideIcon icon={StudyIcon} size={17} color={theme.colors.accent} />
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('2xl'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {studies}
      </Text>
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
  )
}
