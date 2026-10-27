import { View } from 'react-native'
import moment from 'moment'
import {
  Calendar as CalendarIcon,
  MessageSquare as MessageSquareIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import PlanLocationLink from '@/components/PlanLocationLink'
import RichNote from '@/components/RichNote'
import { hasNote } from '@/lib/richText/notes'
import { sharedNoteFields } from '@/features/buddies/lib/sharedNotes'
import useTheme from '@/contexts/theme'
import { formatStartTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import i18n from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { formatPlanLocation } from '@/lib/placeSearch'
import { usePreferences } from '@/stores/preferences'
import type { MinuteDisplayFormat } from '@/types/timeEntry'
import type { ShareDetails } from '@/features/buddies/lib/schemas'

/**
 * A shared Plan or Follow-up in words: its title, "Sat, Oct 10 · 9:00 AM · 2
 * Hrs", and its place. In Data Protection Mode a Follow-up's householder
 * details stay out.
 */
export function sharedEventText(
  details: ShareDetails,
  isFollowUp: boolean,
  {
    timeDisplayFormat,
    dataProtectionMode,
  }: { timeDisplayFormat: MinuteDisplayFormat; dataProtectionMode: boolean }
) {
  // A Follow-up's first name, address, and topic are householder details.
  const hideHouseholder = isFollowUp && dataProtectionMode
  const when = [
    formatWeekdayMonthDayCompact(moment(details.d, 'YYYY-MM-DD')),
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
  const place =
    details.location && !hideHouseholder
      ? formatPlanLocation(details.location).primary
      : undefined
  return { title, when, place, hideHouseholder }
}

/**
 * The details of a buddy's shared Plan or Follow-up, read-only. With `onOpen`,
 * the title opens its page; the place stays its own link, unless the summary
 * sits inside another long-press target (`nested`).
 */
export default function SharedEventSummary({
  details,
  isFollowUp,
  onOpen,
  nested,
}: {
  details: ShareDetails
  isFollowUp: boolean
  onOpen?: () => void
  /** Inside another long-press target, e.g. a bell entry: the place is text. */
  nested?: boolean
}) {
  const theme = useTheme()
  const preferences = usePreferences()
  const { title, when, hideHouseholder } = sharedEventText(
    details,
    isFollowUp,
    preferences
  )

  return (
    <View style={{ gap: 6 }}>
      {title && onOpen ? (
        <Button
          onPress={onOpen}
          accessibilityRole='button'
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold, flexShrink: 1 }}>
            {title}
          </Text>
          <LucideIcon
            icon={ChevronForwardIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        </Button>
      ) : title ? (
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
        <PlanLocationLink location={details.location} interactive={!nested} />
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
      {hasNote(sharedNoteFields(details)) ? (
        // A summary: photos as thumbnails; Plan Details shows them in full.
        <RichNote note={sharedNoteFields(details)} preview thumbnails />
      ) : null}
    </View>
  )
}
