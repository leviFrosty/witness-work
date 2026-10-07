import { useNavigation } from '@react-navigation/native'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import XView from '@/components/ui/layout/XView'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { activeCustomFieldDefs } from '@/lib/customFields'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { RootStackNavigation } from '@/types/rootStack'

/**
 * The visit form's user-defined fields (e.g. "Publication"), in the order set
 * in Preferences → Conversation Fields. With no fields yet, only a link to
 * create one is shown.
 */
export default function VisitCustomFieldsSection({
  customFields,
  setCustomField,
}: {
  customFields?: Record<string, string>
  setCustomField: (id: string, value: string) => void
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const defs = activeCustomFieldDefs(
    useConversations((state) => state.conversationFieldDefs)
  )

  const manageButton = (
    <Button
      onPress={() => navigation.navigate('PreferencesConversationFields')}
    >
      <Text
        style={{
          fontSize: 12,
          color: theme.colors.textAlt,
          textDecorationLine: 'underline',
        }}
      >
        {i18n.t(defs.length ? 'manageContactFields' : 'addCustomFields')}
      </Text>
    </Button>
  )

  if (defs.length === 0)
    return (
      <XView style={{ paddingHorizontal: 12, justifyContent: 'flex-end' }}>
        {manageButton}
      </XView>
    )

  return (
    <View style={{ gap: 8, marginTop: 16 }}>
      <XView
        style={{
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
            letterSpacing: 1.4,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
          }}
        >
          {i18n.t('customFields')}
        </Text>
        {manageButton}
      </XView>
      <Section>
        {defs.map((def, index) => (
          <View key={def.id}>
            <TextInputRow
              label={def.label}
              controlWidth='full'
              textInputProps={{
                placeholder: i18n.t('goesHere'),
                onChangeText: (value: string) => setCustomField(def.id, value),
                value: customFields?.[def.id] ?? '',
                autoCapitalize: 'words',
                textAlign: 'left',
              }}
              lastInSection={index === defs.length - 1}
            />
            <CustomFieldPrivacyWarning
              texts={[def.label, customFields?.[def.id] ?? '']}
            />
          </View>
        ))}
      </Section>
    </View>
  )
}
