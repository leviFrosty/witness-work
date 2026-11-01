import type { ReactNode } from 'react'
import { View } from 'react-native'
import PlanLocationLink from '@/components/PlanLocationLink'
import RichNote from '@/components/RichNote'
import DetailRow from '@/components/ui/inputs/DetailRow'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Section from '@/components/ui/inputs/Section'
import WholeWordsText from '@/components/ui/WholeWordsText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { hasNote, type NoteUpdate } from '@/lib/richText/notes'
import type { NoteFields } from '@/types/richText'
import type { PlanLocation } from '@/types/timeEntry'
import { formatPlanWhen } from '@/features/plans/lib/planWhen'

export type PlanDetailsFields = {
  title?: string

  date: Date
  startTimeInMinutes?: number

  anytime?: boolean

  minutes?: number

  minutesDescription?: string

  typeLabel?: string

  repeats?: string

  changedForDate?: boolean
  location?: PlanLocation
  note?: NoteFields

  onNoteChange?: (fields: NoteUpdate) => void

  lead?: ReactNode
}

type Row = { label: string; value: string; description?: string }

export default function PlanDetailsSummary(props: PlanDetailsFields) {
  const theme = useTheme()
  const duration = useFormattedMinutes(props.minutes ?? 0)

  const rows = [
    { label: i18n.t('date'), value: formatPlanWhen(props) },
    props.minutes !== undefined && {
      label: i18n.t('planDetails_duration'),
      value: duration.formatted,
      description: props.minutesDescription,
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
        <WholeWordsText
          style={{
            fontSize: theme.fontSize('2xl'),
            fontFamily: theme.fonts.bold,
            paddingHorizontal: 5,
          }}
          selectable
        >
          {props.title}
        </WholeWordsText>
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
      {props.note && hasNote(props.note) ? (
        <Section>
          <InputRowContainer
            label={i18n.t('note')}
            lastInSection
            controlWidth='full'
          >
            <RichNote note={props.note} onChange={props.onNoteChange} />
          </InputRowContainer>
        </Section>
      ) : null}
    </View>
  )
}
