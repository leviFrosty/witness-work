import { View } from 'react-native'
import { BookOpenCheck as StudyIcon } from 'lucide-react-native'
import moment from 'moment'

import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { getStudiesForGivenMonth } from '@/lib/contacts'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import MonthServiceReportProgressBar from '@/features/service-reports/components/MonthServiceReportProgressBar'
import { formatDisplay } from '@/lib/dates'

export const MONTH_PREVIEW_WIDTH = 300

const MonthSummaryPreview = ({
  month,
  year,
  completedMinutes,
  goalMinutes,
  statusLabel,
  showsTime,
  sharedInMinistry,
}: {
  month: number
  year: number
  completedMinutes: number

  goalMinutes: number
  statusLabel: string

  showsTime: boolean
  sharedInMinistry: boolean
}) => {
  const theme = useTheme()
  const contacts = useContacts((s) => s.contacts)
  const conversations = useConversations((s) => s.conversations)
  const studies = getStudiesForGivenMonth({
    contacts,
    conversations,
    month: moment({ year, month }).toDate(),
  })
  const completed = useFormattedMinutes(completedMinutes)
  const goal = useFormattedMinutes(goalMinutes)

  return (
    <View
      style={{
        width: MONTH_PREVIEW_WIDTH,
        padding: 18,
        gap: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
      }}
    >
      <View style={{ gap: 2 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            color: theme.colors.text,
          }}
        >
          {formatDisplay({ year, month }, 'MMMM YYYY')}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {goalMinutes > 0
            ? i18n.t('monthStatus.withGoal', {
                status: statusLabel,
                goal: goal.formatted,
              })
            : statusLabel}
        </Text>
      </View>

      {showsTime ? (
        <>
          <Text
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('2xl'),
              color: theme.colors.text,
            }}
          >
            {completed.formatted}
          </Text>
          {goalMinutes > 0 ? (
            <MonthServiceReportProgressBar
              month={month}
              year={year}
              animated={false}
            />
          ) : null}
        </>
      ) : (
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
            color: theme.colors.text,
          }}
        >
          {i18n.t(
            sharedInMinistry ? 'sharedInMinistryYes' : 'sharedInMinistryNo'
          )}
        </Text>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <LucideIcon icon={StudyIcon} size={14} color={theme.colors.accent} />
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {}
          {i18n.t('studiesCount', { count: studies })}
        </Text>
      </View>
    </View>
  )
}

export default MonthSummaryPreview
