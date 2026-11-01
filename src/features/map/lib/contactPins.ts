import moment from 'moment'
import { formatMonthDayCompact, formatDisplay, formatTime } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { ConversationIndex } from '@/lib/conversationIndex'
import type { Contact } from '@/types/contact'
import type { CustomFieldDefinition } from '@/types/customField'
import type { MapCardDetail } from '@/types/map'

export type CardTone = 'overdue' | 'due' | 'plain'

export type CardLine = { text: string; tone: CardTone }

export type PinBadge = 'overdue' | 'today' | 'favorite'

const DUE_SOON_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

const startOfDayMs = (ms: number) => moment(ms).startOf('day').valueOf()

const daysFromToday = (ms: number, nowMs: number) =>
  Math.round((startOfDayMs(ms) - startOfDayMs(nowMs)) / DAY_MS)

const shortDay = (ms: number, nowMs: number) =>
  Math.abs(daysFromToday(ms, nowMs)) < 7
    ? formatDisplay(ms, 'ddd')
    : formatMonthDayCompact(moment(ms))

export type FollowUpState = {
  kind: 'overdue' | 'today' | 'soon' | 'later'
  ms: number
}

export const followUpState = (
  contactId: string,
  index: ConversationIndex,
  nowMs: number
): FollowUpState | null => {
  const missed = index.missedFollowUpMs.get(contactId)
  if (missed !== undefined) return { kind: 'overdue', ms: missed }
  const next = index.nextFollowUpMs.get(contactId)
  if (next === undefined) return null
  const days = daysFromToday(next, nowMs)
  return {
    kind: days === 0 ? 'today' : days < DUE_SOON_DAYS ? 'soon' : 'later',
    ms: next,
  }
}

const isDueState = (state: FollowUpState | null): state is FollowUpState =>
  !!state && state.kind !== 'later'

const lastVisitLine = (
  contactId: string,
  index: ConversationIndex,
  nowMs: number
): CardLine => {
  const last = index.mostRecentConvMs.get(contactId)
  if (last === undefined)
    return { text: i18n.t('map_card_noVisits'), tone: 'plain' }
  const days = daysFromToday(last, nowMs)
  return {
    text:
      days === 0
        ? i18n.t('map_card_visitedToday')
        : i18n.t('map_card_visited', {
            date:
              days < -300
                ? formatDisplay(last, 'MMM YYYY')
                : shortDay(last, nowMs),
          }),
    tone: 'plain',
  }
}

const followUpLine = (state: FollowUpState, nowMs: number): CardLine =>
  state.kind === 'overdue'
    ? {
        text: i18n.t('map_card_overdue', { date: shortDay(state.ms, nowMs) }),
        tone: 'overdue',
      }
    : state.kind === 'today'
      ? {
          text: i18n.t('map_card_today', { time: formatTime(state.ms) }),
          tone: 'due',
        }
      : {
          text: i18n.t('map_card_followUp', {
            date: shortDay(state.ms, nowMs),
            time: formatTime(state.ms),
          }),
          tone: 'due',
        }

const followUpTopic = (contactId: string, index: ConversationIndex) => {
  if (
    !index.missedFollowUpMs.has(contactId) &&
    !index.nextFollowUpMs.has(contactId)
  )
    return undefined
  const followUp = index.mostRecentConvByContact.get(contactId)?.followUp
  return followUp?.topic?.trim() || undefined
}

export const CARD_DETAIL_CHOICES: {
  value: MapCardDetail
  label: TranslationKey
  description?: TranslationKey
}[] = [
  {
    value: 'nextVisit',
    label: 'map_cardDetail_nextVisit',
    description: 'map_cardDetail_nextVisit_description',
  },
  { value: 'lastVisit', label: 'map_cardDetail_lastVisit' },
  { value: 'followUpTopic', label: 'map_cardDetail_followUpTopic' },
  { value: 'nameOnly', label: 'map_cardDetail_nameOnly' },
]

export const cardDetailFields = (defs: CustomFieldDefinition[]) =>
  defs.filter((def) => !def.archived).sort((a, b) => a.order - b.order)

export const resolveCardDetail = (
  detail: string | undefined,
  defs: CustomFieldDefinition[]
): MapCardDetail => {
  if (
    detail === 'nextVisit' ||
    detail === 'lastVisit' ||
    detail === 'followUpTopic' ||
    detail === 'nameOnly'
  )
    return detail
  if (detail?.startsWith('field:')) {
    const id = detail.slice('field:'.length)
    if (defs.some((def) => def.id === id && !def.archived)) {
      return `field:${id}`
    }
  }
  return 'nextVisit'
}

export const contactCardLine = (
  contact: Pick<Contact, 'id' | 'customFields'>,
  index: ConversationIndex,
  detail: MapCardDetail,
  nowMs: number,
  followUp: FollowUpState | null = followUpState(contact.id, index, nowMs)
): CardLine | null => {
  switch (detail) {
    case 'nameOnly':
      return null
    case 'lastVisit':
      return lastVisitLine(contact.id, index, nowMs)
    case 'followUpTopic': {
      const topic = followUpTopic(contact.id, index)
      return topic ? { text: topic, tone: 'due' } : null
    }
    case 'nextVisit':
      return followUp
        ? followUpLine(followUp, nowMs)
        : lastVisitLine(contact.id, index, nowMs)
    default: {
      const value = contact.customFields?.[detail.slice('field:'.length)]
      return value?.trim() ? { text: value.trim(), tone: 'plain' } : null
    }
  }
}

const badgeOf = (
  contact: Pick<Contact, 'isFavorite'>,
  followUp: FollowUpState | null
): PinBadge | undefined =>
  followUp?.kind === 'overdue'
    ? 'overdue'
    : followUp?.kind === 'today'
      ? 'today'
      : contact.isFavorite
        ? 'favorite'
        : undefined

const urgencyOf = (
  contact: Pick<Contact, 'id' | 'isFavorite'>,
  followUp: FollowUpState | null,
  index: ConversationIndex,
  nowMs: number
) => {
  const BAND = 1e14
  if (followUp?.kind === 'overdue') return followUp.ms
  if (isDueState(followUp)) return BAND + followUp.ms
  if (contact.isFavorite) return 2 * BAND
  const last = index.mostRecentConvMs.get(contact.id)

  return 3 * BAND + (last ?? nowMs - 45 * DAY_MS)
}

export const pinBadge = (
  contact: Pick<Contact, 'id' | 'isFavorite'>,
  index: ConversationIndex,
  nowMs: number
) => badgeOf(contact, followUpState(contact.id, index, nowMs))

export const contactUrgency = (
  contact: Pick<Contact, 'id' | 'isFavorite'>,
  index: ConversationIndex,
  nowMs: number
) => urgencyOf(contact, followUpState(contact.id, index, nowMs), index, nowMs)

export type ContactPinFacts = {
  followUp: FollowUpState | null

  urgency: number
  badge?: PinBadge
}

export const contactPinFacts = (
  contact: Pick<Contact, 'id' | 'isFavorite'>,
  index: ConversationIndex,
  nowMs: number
): ContactPinFacts => {
  const followUp = followUpState(contact.id, index, nowMs)
  return {
    followUp,
    urgency: urgencyOf(contact, followUp, index, nowMs),
    badge: badgeOf(contact, followUp),
  }
}

export const pinInitials = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = Array.from(words[0] ?? '')[0] ?? ''
  const last = words.length > 1 ? (Array.from(words.at(-1)!)[0] ?? '') : ''
  return (first + last).toLocaleUpperCase() || '•'
}

const sharedStreet = (members: Pick<Contact, 'address'>[]) => {
  const streets = new Set(
    members.map((m) => m.address?.line1?.trim().toLocaleLowerCase() ?? '')
  )
  const street = members[0]?.address?.line1?.trim()
  return streets.size === 1 && street ? street : undefined
}

export const groupTitle = (members: Pick<Contact, 'address'>[]) => {
  const street = sharedStreet(members)
  return street
    ? i18n.t('map_group_atStreet', { count: members.length, street })
    : i18n.t('map_group_count' as TranslationKey, { count: members.length })
}

export const groupAccessibilityLabel = (
  members: Pick<Contact, 'address'>[]
) => {
  const street = sharedStreet(members)
  return street
    ? i18n.t('map_group_atStreet_a11y' as TranslationKey, {
        count: members.length,
        street,
      })
    : i18n.t('map_group_count' as TranslationKey, { count: members.length })
}

export const cardToneColor = (
  tone: CardTone,
  colors: { error: string; accent: string; textAlt: string }
) =>
  tone === 'overdue'
    ? colors.error
    : tone === 'due'
      ? colors.accent
      : colors.textAlt
