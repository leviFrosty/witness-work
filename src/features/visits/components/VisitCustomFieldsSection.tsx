import { useNavigation } from '@react-navigation/native'
import {
  ChevronRight as ChevronRightIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { activeCustomFieldDefs } from '@/lib/customFields'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { RootStackNavigation } from '@/types/rootStack'

/**
 * The visit form's user-defined fields (e.g. "Publication"), in the order set
 * in Preferences → Conversation Fields, followed by a row that opens that
 * screen. With no fields yet, only that row is shown.
 */
export default function VisitCustomFieldsSection({
  customFields,
  setCustomField,
}: {
  customFields?: Record<string, string>
  setCustomField: (id: string, value: string) => void
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const defs = activeCustomFieldDefs(
    useConversations((state) => state.conversationFieldDefs)
  )

  return (
    <Section>
      {defs.map((def) => (
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
          />
          <CustomFieldPrivacyWarning
            texts={[def.label, customFields?.[def.id] ?? '']}
          />
        </View>
      ))}
      <InputRowButton
        leftIcon={SlidersHorizontalIcon}
        label={i18n.t(defs.length ? 'manageCustomFields' : 'addCustomFields')}
        onPress={() => navigation.navigate('PreferencesConversationFields')}
        lastInSection
      >
        <IconButton icon={ChevronRightIcon} />
      </InputRowButton>
    </Section>
  )
}
