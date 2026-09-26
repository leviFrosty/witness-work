import moment from 'moment'
import { parsePhoneNumber } from 'awesome-phonenumber'
import {
  buildUniqueContactFixture,
  UNIQUE_CONTACT_CUSTOM_FIELD_LABELS,
  UNIQUE_CONTACT_ID,
  UNIQUE_CONTACT_UNKNOWN_DEF_ID,
  UNIQUE_VISIT_ID_PREFIX,
} from '@/app/dev-fixtures/uniqueContact'
import { Visit } from '@/types/visit'
import { describe, expect, it } from 'vitest'

const now = moment('2026-09-23T15:00:00')
const customFieldIds = {
  language: 'def-language',
  bestTime: 'def-best-time',
  longLabel: 'def-long-label',
  archived: 'def-archived',
  emptyValue: 'def-empty-value',
}

const build = () => buildUniqueContactFixture({ now, customFieldIds })
const { contact, visits, highlightedVisitId } = build()

const hasVisit = (predicate: (visit: Visit) => boolean) =>
  visits.some(predicate)

const isPast = (date: Date) => moment(date).isBefore(now)
const isFuture = (date: Date) => moment(date).isAfter(now)

describe('app/dev-fixtures/uniqueContact', () => {
  it('is deterministic for a given now', () => {
    expect(build()).toEqual(build())
  })

  it('gives every visit a unique, prefixed id', () => {
    const ids = visits.map((v) => v.id)
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) =>
      expect(id.startsWith(UNIQUE_VISIT_ID_PREFIX)).toBe(true)
    )
  })

  it('attaches every visit to the unique contact', () => {
    expect(contact.id).toBe(UNIQUE_CONTACT_ID)
    visits.forEach((v) => expect(v.contact).toEqual({ id: UNIQUE_CONTACT_ID }))
  })

  it('was created before its oldest visit', () => {
    visits.forEach((v) =>
      expect(contact.createdAt.getTime()).toBeLessThan(v.date.getTime())
    )
  })

  it('highlights one of its own visits', () => {
    expect(visits.map((v) => v.id)).toContain(highlightedVisitId)
  })

  it('highlights a follow-up inside the 4h grace window', () => {
    const highlighted = visits.find((v) => v.id === highlightedVisitId)
    const followUpDate = moment(highlighted?.followUp?.date)
    expect(followUpDate.isBefore(now)).toBe(true)
    expect(followUpDate.isAfter(now.clone().subtract(4, 'hours'))).toBe(true)
  })

  it('has a phone number that is only valid with its region code', () => {
    expect(contact.phoneRegionCode).toBe('SE')
    expect(
      parsePhoneNumber(contact.phone ?? '', {
        regionCode: contact.phoneRegionCode,
      }).valid
    ).toBe(true)
    expect(
      parsePhoneNumber(contact.phone ?? '', { regionCode: 'US' }).valid
    ).toBe(false)
  })

  it('keeps values for archived, empty, and unknown custom fields', () => {
    expect(Object.keys(UNIQUE_CONTACT_CUSTOM_FIELD_LABELS)).toHaveLength(5)
    expect(contact.customFields?.[customFieldIds.archived]).toBeTruthy()
    expect(contact.customFields?.[customFieldIds.emptyValue]).toBe('')
    expect(contact.customFields?.[UNIQUE_CONTACT_UNKNOWN_DEF_ID]).toBeTruthy()
  })

  describe('covers the visit rendering matrix', () => {
    it.each<[string, (visit: Visit) => boolean]>([
      ['not at home', (v) => !!v.notAtHome && !v.isBibleStudy],
      ['bible study', (v) => v.isBibleStudy && !v.notAtHome],
      ['not at home AND bible study', (v) => !!v.notAtHome && v.isBibleStudy],
      ['future-dated visit', (v) => isFuture(v.date)],
      ['visit today', (v) => moment(v.date).isSame(now, 'day')],
      [
        'visit at exactly midnight',
        (v) => moment(v.date).isSame(moment(v.date).startOf('day')),
      ],
      [
        'tie-timestamp pair',
        (v) =>
          visits.some(
            (other) =>
              other.id !== v.id && other.date.getTime() === v.date.getTime()
          ),
      ],
      ['dismissed follow-up', (v) => !!v.followUp?.dismissed],
      [
        'past follow-up without reminder or topic',
        (v) =>
          !!v.followUp &&
          isPast(v.followUp.date) &&
          !v.followUp.notifyMe &&
          !v.followUp.topic,
      ],
      [
        'future follow-up with reminder and topic',
        (v) =>
          !!v.followUp &&
          isFuture(v.followUp.date) &&
          v.followUp.notifyMe &&
          !!v.followUp.topic,
      ],
      [
        'follow-up with notifications',
        (v) => (v.followUp?.notifications?.length ?? 0) > 0,
      ],
      ['empty-string note', (v) => v.note === ''],
      ['undefined note', (v) => v.note === undefined],
      ['whitespace-only note', (v) => !!v.note && v.note.trim() === ''],
      ['note longer than 1000 chars', (v) => (v.note?.length ?? 0) > 1000],
      [
        'multi-line note',
        (v) => !!v.note?.trim() && v.note.trim().includes('\n'),
      ],
      ['note with a URL', (v) => !!v.note?.includes('https://')],
      [
        'visit older than 4 years',
        (v) => moment(v.date).isBefore(now.clone().subtract(4, 'years')),
      ],
      [
        'visit in the previous calendar year',
        (v) => moment(v.date).year() === now.year() - 1,
      ],
    ])('%s', (_, predicate) => {
      expect(hasVisit(predicate)).toBe(true)
    })
  })
})
