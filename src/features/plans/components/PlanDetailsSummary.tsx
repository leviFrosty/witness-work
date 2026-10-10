import type { ReactNode } from 'react'
import { View } from 'react-native'
import PlanLocationLink from '@/components/PlanLocationLink'
import RichNoteText from '@/components/RichNoteText'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import type { PlanLocation } from '@/types/timeEntry'
import { formatPlanWhen } from '@/features/plans/lib/planWhen'

/** What a Plan (or a buddy's Plan invitation) shows on Plan Details. */
export type PlanDetailsFields = {
  title?: string
  /** Local day. */
  date: Date
  startTimeInMinutes?: number
  /** Unset for a buddy's invitation that gave no length. */
  minutes?: number
  /** Own Plans only: a buddy's invitation carries no Type. */
  typeLabel?: string
  /** A Recurring Plan's pattern in words. */
  repeats?: string
  /** This date of a Recurring Plan has its own time, length, or note. */
  changedForDate?: boolean
  location?: PlanLocation
  note?: string
  /**
   * Shown right under the title, e.g. the answer to a buddy's invitation, so it
   * stays put when rows below come and go.
   */
  lead?: ReactNode
}

type Row = { label: string; value: string; description?: string }

function DetailRow({
  label,
  value,
  description,
  last,
}: {
  label: string
  value: string
  description?: string
  last?: boolean
}) {
  const theme = useTheme()
  return (
    <InputRowContainer
      label={label}
      description={description}
      lastInSection={last}
      controlWidth='auto'
      // A long value (a range past midnight) wraps rather than squeezing the
      // label.
      controlStyle={{ maxWidth: '70%' }}
    >
      <Text
        style={{ color: theme.colors.textAlt, textAlign: 'right' }}
        selectable
      >
        {value}
      </Text>
    </InputRowContainer>
  )
}

/** A Plan's title, when, how long, Type, recurrence, place, and note. */
export default function PlanDetailsSummary(props: PlanDetailsFields) {
  const theme = useTheme()
  const duration = useFormattedMinutes(props.minutes ?? 0)

  const rows = [
    { label: i18n.t('date'), value: formatPlanWhen(props) },
    props.minutes !== undefined && {
      label: i18n.t('planDetails_duration'),
      value: duration.formatted,
    },
    props.typeLabel && { label: i18n.t('type'), value: props.typeLabel },
    props.repeats && {
      label: i18n.t('planDetails_repeats'),
      value: props.repeats,
      description: props.changedForDate
        ? i18n.t('planDetails_changedForDate')
        : undefined,
    },
  ].filter((row): row is Row => !!row)

  return (
    <View style={{ gap: 20 }}>
      {props.title ? (
        <Text
          style={{
            fontSize: theme.fontSize('2xl'),
            fontFamily: theme.fonts.bold,
            paddingHorizontal: 5,
          }}
          selectable
        >
          {props.title}
        </Text>
      ) : null}
      {props.lead}
      <Section>
        {rows.map((row, index) => (
          <DetailRow
            key={row.label}
            {...row}
            last={!props.location && index === rows.length - 1}
          />
        ))}
        {props.location ? (
          <InputRowContainer
            label={i18n.t('location')}
            lastInSection
            controlWidth='full'
          >
            <PlanLocationLink location={props.location} />
          </InputRowContainer>
        ) : null}
      </Section>
      {props.note ? (
        <Section>
          <InputRowContainer
            label={i18n.t('note')}
            lastInSection
            controlWidth='full'
          >
            <RichNoteText text={props.note} />
          </InputRowContainer>
        </Section>
      ) : null}
    </View>
  )
}
