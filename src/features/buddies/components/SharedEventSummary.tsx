import { View } from 'react-native'
import moment from 'moment'
import {
  Calendar as CalendarIcon,
  MessageSquare as MessageSquareIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import PlanLocationLink from '@/components/PlanLocationLink'
import RichNoteText from '@/components/RichNoteText'
import useTheme from '@/contexts/theme'
import { formatStartTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { usePreferences } from '@/stores/preferences'
import type { ShareDetails } from '@/features/buddies/lib/schemas'

/** The details of a buddy's shared Plan or Follow-up, read-only. */
export default function SharedEventSummary({
  details,
  isFollowUp,
}: {
  details: ShareDetails
  isFollowUp: boolean
}) {
  const theme = useTheme()
  const { timeDisplayFormat, dataProtectionMode } = usePreferences()
  // A Follow-up's first name, address, and topic are householder details.
  const hideHouseholder = isFollowUp && dataProtectionMode
  const day = formatWeekdayMonthDayCompact(moment(details.d, 'YYYY-MM-DD'))
  const when = [
    day,
    details.s === undefined ? undefined : formatStartTime(details.s),
    details.m === undefined
      ? undefined
      : formatMinutes(details.m, timeDisplayFormat).formatted,
  ]
    .filter(Boolean)
    .join(' · ')
  const title = isFollowUp
    ? details.firstName && !hideHouseholder
      ? i18n.t('buddies_followUpWith', { name: details.firstName })
      : i18n.t('buddies_followUp')
    : details.title

  return (
    <View style={{ gap: 6 }}>
      {title ? (
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
      ) : null}
      <XView style={{ gap: 8 }}>
        <LucideIcon
          icon={CalendarIcon}
          size={14}
          color={theme.colors.textAlt}
        />
        <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
          {when}
        </Text>
      </XView>
      {details.location && !hideHouseholder ? (
        <PlanLocationLink location={details.location} />
      ) : null}
      {details.topic && !hideHouseholder ? (
        <XView style={{ gap: 8, alignItems: 'flex-start' }}>
          <LucideIcon
            icon={MessageSquareIcon}
            size={14}
            color={theme.colors.textAlt}
            style={{ marginTop: 2 }}
          />
          <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
            {details.topic}
          </Text>
        </XView>
      ) : null}
      {details.note ? <RichNoteText text={details.note} /> : null}
    </View>
  )
}
