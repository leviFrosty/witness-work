import moment from 'moment'
import { formatStartTime, formatWeekdayMonthDayCompact } from '@/lib/dates'
import { formatMinutes } from '@/lib/minutes'
import type { MinuteDisplayFormat } from '@/types/timeEntry'
import i18n, { type TranslationKey } from '@/lib/locales'
import type {
  ScribeEffect,
  ScribeEffectPreview,
  ScribeFieldChange,
  ScribeReviewCard,
  ScribeSpoken,
  ScribeWarning,
  ScribeWarningCode,
} from '@/features/scribe/types'

/** "Today · Wed, Oct 21", "Tomorrow · …", else "Wed, Oct 21". */
export const reviewDate = (date: string, now = moment()): string => {
  const day = moment(date, 'YYYY-MM-DD')
  const compact = formatWeekdayMonthDayCompact(day)
  const days = day.diff(now.clone().startOf('day'), 'days')
  if (days === 0) return `${i18n.t('today')} · ${compact}`
  if (days === 1) return `${i18n.t('tomorrow')} · ${compact}`
  return compact
}

/** `from "next Tuesday"`, for a value Scribe AI worked out from a phrase. */
export const fromSpoken = (spoken: ScribeSpoken | null): string | null => {
  const phrase = [spoken?.date, spoken?.time].filter(Boolean).join(' ')
  return phrase ? i18n.t('scribe_fromSpoken', { phrase }) : null
}

const duration = (minutes: number, format: MinuteDisplayFormat) =>
  formatMinutes(minutes, format).formatted

const FIELD_LABEL: Record<ScribeFieldChange['field'], TranslationKey> = {
  date: 'scribe_field_date',
  minutes: 'scribe_field_minutes',
  startMinutes: 'scribe_field_start',
  anytime: 'scribe_field_anytime',
  title: 'scribe_field_title',
  note: 'scribe_field_note',
  name: 'scribe_field_name',
  phone: 'scribe_field_phone',
  email: 'scribe_field_email',
  address: 'scribe_field_address',
}

/** "Start: 9:00 AM → 10:00 AM". */
export const changeLine = (
  change: ScribeFieldChange,
  format: MinuteDisplayFormat
): string => {
  const value = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    switch (change.field) {
      case 'date':
        return formatWeekdayMonthDayCompact(moment(String(v), 'YYYY-MM-DD'))
      case 'minutes':
        return duration(Number(v), format)
      case 'startMinutes':
        return formatStartTime(Number(v))
      case 'anytime':
        return v ? i18n.t('scribe_cardPlanAnytime') : '—'
      default:
        return String(v)
    }
  }
  return i18n.t('scribe_cardChange', {
    field: i18n.t(FIELD_LABEL[change.field]),
    before: value(change.before),
    after: value(change.after),
  })
}

const WARNING_COPY: Partial<Record<ScribeWarningCode, TranslationKey>> = {
  duplicate_time: 'scribe_warning_duplicateTime',
  plan_overlap: 'scribe_warning_planOverlap',
  over_credit_cap: 'scribe_warning_overCreditCap',
}

export interface CardWarning {
  text: string
  severity: ScribeWarning['severity']
}

/** Warnings to show on a card; `shared_month` is its title instead. */
export const cardWarnings = (card: ScribeReviewCard): CardWarning[] =>
  card.effects
    .flatMap((effect) => effect.warnings)
    .flatMap(({ code, severity }) => {
      const key = WARNING_COPY[code]
      return key ? [{ text: i18n.t(key), severity }] : []
    })

export interface ReviewLine {
  title: string
  /** Shown under the title, joined with " · ". */
  meta: string[]
  /** `from "…"`. */
  spoken: string | null
}

const isSharedMarker = (effect: ScribeEffect) =>
  effect.warnings.some((w) => w.code === 'shared_month')

/** A single-effect card's (or nested row's) lines. */
export const effectLines = (
  effect: ScribeEffect,
  format: MinuteDisplayFormat
): ReviewLine[] => {
  const preview: ScribeEffectPreview = effect.preview
  switch (preview.kind) {
    case 'time.create':
      return [
        {
          title:
            preview.minutes === 0 && isSharedMarker(effect)
              ? i18n.t('scribe_cardSharedMonth')
              : preview.category
                ? i18n.t('scribe_cardTimeCategory', {
                    duration: duration(preview.minutes, format),
                    category: preview.category.name,
                  })
                : i18n.t('scribe_cardTime', {
                    duration: duration(preview.minutes, format),
                  }),
          meta: [reviewDate(preview.date), preview.note ?? ''].filter(Boolean),
          spoken: fromSpoken(preview.spoken),
        },
      ]
    case 'plan.create': {
      const date = formatWeekdayMonthDayCompact(
        moment(preview.date, 'YYYY-MM-DD')
      )
      return [
        {
          title:
            preview.startMinutes !== null && !preview.anytime
              ? i18n.t('scribe_cardPlanAt', {
                  date,
                  time: formatStartTime(preview.startMinutes),
                })
              : i18n.t('scribe_cardPlan', { date }),
          meta: [
            duration(preview.minutes, format),
            preview.anytime ? i18n.t('scribe_cardPlanAnytime') : '',
            preview.category?.name ?? '',
            preview.title ?? '',
          ].filter(Boolean),
          spoken: fromSpoken(preview.spoken),
        },
        ...(preview.inviteNames.length
          ? [
              {
                title: i18n.t('scribe_cardPlanInvite', {
                  names: preview.inviteNames.join(', '),
                }),
                meta: [],
                spoken: null,
              },
            ]
          : []),
      ]
    }
    case 'plan.update':
      return [
        {
          title: i18n.t('scribe_cardPlanUpdate', {
            date: formatWeekdayMonthDayCompact(
              moment(preview.date, 'YYYY-MM-DD')
            ),
          }),
          meta: preview.title ? [preview.title] : [],
          spoken: fromSpoken(preview.spoken),
        },
        ...preview.changes.map((change) => ({
          title: changeLine(change, format),
          meta: [],
          spoken: null,
        })),
      ]
    case 'category.create':
      return [
        {
          title: i18n.t('scribe_cardCategory', { name: preview.name }),
          meta: preview.credit ? [i18n.t('scribe_cardCredit')] : [],
          spoken: null,
        },
      ]
    case 'contact.create':
      return [
        {
          title: preview.name,
          meta: [preview.address, preview.phone, preview.email].filter(
            (v): v is string => !!v
          ),
          spoken: null,
        },
      ]
    case 'contact.update':
      return [
        {
          title: i18n.t('scribe_cardContactUpdate', { name: preview.name }),
          meta: [],
          spoken: null,
        },
        ...preview.changes.map((change) => ({
          title: changeLine(change, format),
          meta: [],
          spoken: null,
        })),
      ]
    case 'visit.create': {
      const lines: ReviewLine[] = [
        {
          title: preview.notAtHome
            ? i18n.t('scribe_cardNotAtHome')
            : preview.note
              ? i18n.t('scribe_cardVisitNote', { note: preview.note })
              : i18n.t('scribe_cardVisit'),
          meta: [
            reviewDate(preview.date),
            preview.bibleStudy ? i18n.t('scribe_cardBibleStudy') : '',
          ].filter(Boolean),
          spoken: fromSpoken(preview.spoken),
        },
      ]
      if (preview.followUp)
        lines.push({
          title: i18n.t('scribe_cardFollowUp', {
            date: formatWeekdayMonthDayCompact(
              moment(preview.followUp.date, 'YYYY-MM-DD')
            ),
          }),
          meta: preview.followUp.topic ? [preview.followUp.topic] : [],
          spoken: fromSpoken(preview.followUp.spoken),
        })
      return lines
    }
  }
}

/** A choice card's subtitle: what will be logged once the person is picked. */
export const choiceSummary = (
  card: ScribeReviewCard,
  format: MinuteDisplayFormat
): string =>
  card.effects
    .filter((effect) => effect.kind === 'visit.create')
    .flatMap((effect) => effectLines(effect, format).slice(0, 1))
    .map((line) => [line.title, ...line.meta].join(' · '))
    .join(' · ')
