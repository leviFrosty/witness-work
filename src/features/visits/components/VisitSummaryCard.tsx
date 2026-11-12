import {
  BookOpen as BookOpenIcon,
  DoorClosed as DoorClosedIcon,
  MessageCircle as MessageCircleIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import RichNote from '@/components/RichNote'
import Text from '@/components/ui/MyText'
import StatusCaption from '@/components/ui/StatusCaption'
import useTheme from '@/contexts/theme'
import { activeCustomFieldDefs } from '@/lib/customFields'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import { hasNote } from '@/lib/richText/notes'
import useConversations from '@/stores/conversationStore'
import type { Visit } from '@/types/visit'
import DetailsCard, {
  DETAILS_CARD_EDGE,
} from '@/features/visits/components/DetailsCard'
import {
  detailsDateTime,
  outcomeLabel,
} from '@/features/visits/lib/visitDetails'

export default function VisitSummaryCard({ visit }: { visit: Visit }) {
  const theme = useTheme()
  const fieldDefs = useConversations((state) => state.conversationFieldDefs)
  const updateConversation = useConversations(
    (state) => state.updateConversation
  )
  const date = new Date(visit.date)
  const fields = activeCustomFieldDefs(fieldDefs).flatMap((def) => {
    const value = visit.customFields?.[def.id]?.trim()
    return value ? [{ id: def.id, label: def.label, value }] : []
  })
  const icon = visit.notAtHome
    ? DoorClosedIcon
    : visit.isBibleStudy
      ? BookOpenIcon
      : MessageCircleIcon
  const textStyle = { fontSize: theme.fontSize('sm') + 1, lineHeight: 19 }

  return (
    <DetailsCard
      testID='visit-details-visit'
      style={{ paddingHorizontal: DETAILS_CARD_EDGE + 2, gap: 6 }}
    >
      <StatusCaption
        icon={icon}
        text={`${outcomeLabel(visit)} · ${formatRelative(date)}`}
      />
      <Text
        accessibilityRole='header'
        style={{
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {detailsDateTime(date)}
      </Text>
      {hasNote(visit) ? (
        <View style={{ paddingTop: 2 }}>
          <RichNote
            note={visit}
            style={textStyle}
            onChange={(fields) => updateConversation({ ...visit, ...fields })}
          />
        </View>
      ) : null}
      {fields.length > 0 ? (
        <View style={{ gap: 2, paddingTop: 2 }}>
          {fields.map((field) => (
            <Text key={field.id} selectable style={textStyle}>
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.textAlt,
                }}
              >
                {`${i18n.t('customFieldLabel', { label: field.label })} `}
              </Text>
              {field.value}
            </Text>
          ))}
        </View>
      ) : null}
    </DetailsCard>
  )
}
