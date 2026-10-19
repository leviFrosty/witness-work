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

/**
 * The visit form's user-defined fields (e.g. "Publication"), in the order set
 * in Preferences → Conversation Fields, followed by a row that opens that
 * screen. With no fields yet, only that row is shown. Each field suggests
 * values from other visits and lists the contact's earlier ones.
 */
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
  /** Scrolls the form down by this many points, to reveal suggestions. */
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
