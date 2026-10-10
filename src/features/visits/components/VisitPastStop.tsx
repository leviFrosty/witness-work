import { View } from 'react-native'
import RichNoteText from '@/components/RichNoteText'
import EmphasizedText from '@/components/ui/EmphasizedText'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { activeCustomFieldDefs } from '@/lib/customFields'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'
import {
  detailsDateTime,
  pastSentenceKey,
} from '@/features/visits/lib/visitDetails'

/**
 * What happened at the Visit, in the past tense: "You held a Bible study with
 * Chen Wei", when, the note as a quote, and its fields as chips.
 */
export default function VisitPastStop({
  visit,
  contactName,
}: {
  visit: Visit
  contactName: string
}) {
  const theme = useTheme()
  const fieldDefs = useConversations((state) => state.conversationFieldDefs)
  const date = new Date(visit.date)
  const note = visit.note?.trim()
  const fields = activeCustomFieldDefs(fieldDefs).flatMap((def) => {
    const value = visit.customFields?.[def.id]?.trim()
    return value ? [{ id: def.id, label: def.label, value }] : []
  })

  return (
    <View style={{ gap: 6 }}>
      <EmphasizedText
        translate={(values) => i18n.t(pastSentenceKey(visit), values)}
        values={{ name: contactName }}
        emphasis={{ fontFamily: theme.fonts.semiBold }}
        style={{ fontSize: theme.fontSize('lg'), lineHeight: 22 }}
      />
      <Text
        style={{ fontSize: theme.fontSize('sm'), color: theme.colors.textAlt }}
      >
        {`${detailsDateTime(date)} · ${formatRelative(date)}`}
      </Text>
      {note ? (
        <View
          style={{
            marginTop: 4,
            paddingLeft: 10,
            borderLeftWidth: 2,
            borderLeftColor: theme.colors.border,
          }}
        >
          <RichNoteText text={note} />
        </View>
      ) : null}
      {fields.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 4,
          }}
        >
          {fields.map((field) => (
            <View
              key={field.id}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 3,
              }}
            >
              <Text
                selectable
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                }}
              >
                {`${i18n.t('customFieldLabel', { label: field.label })} ${field.value}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
