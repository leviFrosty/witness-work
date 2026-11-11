import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { Journey, VisitOutcome } from '@/features/contacts/lib/visitTimeline'

const OUTCOMES: VisitOutcome[] = ['study', 'conversation', 'notAtHome']
const COUNT_KEY = {
  study: 'studyCount',
  conversation: 'conversationCount',
  notAtHome: 'notAtHomeCount',
} as const

const VisitHistorySummary = ({ journey }: { journey: Journey }) => {
  const theme = useTheme()
  return (
    <Text
      style={{
        fontSize: theme.fontSize('sm'),
        color: theme.colors.textAlt,
        paddingHorizontal: 2,
      }}
    >
      {OUTCOMES.filter((outcome) => journey.outcomeCounts[outcome])
        .map((outcome) =>
          i18n.t(`contactDetails.${COUNT_KEY[outcome]}`, {
            count: journey.outcomeCounts[outcome],
          })
        )
        .join(' · ')}
    </Text>
  )
}

export default VisitHistorySummary
