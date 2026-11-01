import { useNavigation } from '@react-navigation/native'
import { SlidersHorizontal as SlidersHorizontalIcon } from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import VisitCustomFieldInput from '@/features/visits/components/VisitCustomFieldInput'
import { activeCustomFieldDefs } from '@/lib/customFields'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import { RootStackNavigation } from '@/types/rootStack'

export default function VisitCustomFieldsSection({
  customFields,
  setCustomField,
  contactId,
  visitId,
  visitDate,
  scrollBy,
}: {
  customFields?: Record<string, string>
  setCustomField: (id: string, value: string) => void
  contactId: string
  visitId: string
  visitDate: Date

  scrollBy: (dy: number) => void
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const defs = activeCustomFieldDefs(
    useConversations((state) => state.conversationFieldDefs)
  )

  return (
    <Section>
      {defs.map((def) => (
        <VisitCustomFieldInput
          key={def.id}
          def={def}
          value={customFields?.[def.id] ?? ''}
          onChange={(value) => setCustomField(def.id, value)}
          contactId={contactId}
          visitId={visitId}
          visitDate={visitDate}
          scrollBy={scrollBy}
        />
      ))}
      <InputRowButton
        leftIcon={SlidersHorizontalIcon}
        label={i18n.t(defs.length ? 'manageCustomFields' : 'addCustomFields')}
        onPress={() => navigation.navigate('PreferencesConversationFields')}
        lastInSection
      >
        <IconButton icon={ChevronForwardIcon} />
      </InputRowButton>
    </Section>
  )
}
