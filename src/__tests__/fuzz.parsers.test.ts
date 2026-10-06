import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import moment from 'moment'

// Property-based fuzzing of the parsers that read untrusted input (pasted
// links, shared URLs) and of the verification scenarios. A failure prints the
// seed and the shrunk counterexample; rerun with `FC_SEED=<seed> pnpm vitest
// run src/__tests__/fuzz.parsers.test.ts` to reproduce it.

vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  Platform: { OS: 'ios' },
}))
vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }))
vi.mock('expo-file-system/legacy', () => ({ readAsStringAsync: vi.fn() }))
vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import {
  buildContactShareLink,
  parseContactShareLink,
} from '@/features/contacts/lib/contactShareLink'
import { validateContactImport } from '@/features/contacts/lib/contactImport'
import {
  buildInviteLink,
  parseInviteSecret,
} from '@/features/buddies/lib/inviteLink'
import { buildScenario, SCENARIO_NAMES } from '@/app/dev-harness/scenarios'

const seed = process.env.FC_SEED ? Number(process.env.FC_SEED) : undefined
const runs = { numRuns: 300, seed }

const shareOrigin = 'https://ww-proxy.leviwilkerson.com'

/** Strings shaped like the links the app accepts, with hostile payloads. */
const linkLike = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc
    .tuple(
      fc.constantFrom(
        `${shareOrigin}/c#`,
        `${shareOrigin}/c/`,
        'witnesswork://import-contact/',
        `${shareOrigin}/b#1`,
        `${shareOrigin}/b/#1`
      ),
      fc.string({ unit: 'binary', maxLength: 600 })
    )
    .map(([prefix, payload]) => prefix + payload),
  fc
    .base64String({ maxLength: 400 })
    .map(
      (b64) => `${shareOrigin}/c#${b64.replace(/\+/g, '-').replace(/\//g, '_')}`
    )
)

describe('contact share links', () => {
  it('never throw on arbitrary input', () => {
    fc.assert(
      fc.property(linkLike, (url) => {
        const parsed = parseContactShareLink(url)
        expect(() => validateContactImport(parsed)).not.toThrow()
      }),
      runs
    )
  })

  it('round-trip any contact name, phone, and note', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', minLength: 1, maxLength: 80 }),
        fc.option(fc.string({ unit: 'grapheme', maxLength: 30 }), {
          nil: undefined,
        }),
        fc.string({ unit: 'grapheme', maxLength: 200 }),
        (name, phone, note) => {
          const createdAt = new Date('2026-04-15T00:00:00.000Z')
          const contact = { id: 'fuzz-contact', name, phone, createdAt }
          const visit = {
            id: 'fuzz-visit',
            contact: { id: contact.id },
            date: createdAt,
            note,
            isBibleStudy: false,
          }
          const { url } = buildContactShareLink(contact, [visit])
          const result = validateContactImport(parseContactShareLink(url))
          expect(result.success).toBe(true)
          expect(result.data?.contact.name).toBe(name)
          expect(result.data?.contact.phone).toBe(phone || undefined)
          expect(result.data?.conversations?.[0]?.note ?? '').toBe(note)
        }
      ),
      { ...runs, numRuns: 150 }
    )
  })
})

describe('buddy invite links', () => {
  it('never throw on arbitrary input', () => {
    fc.assert(
      fc.property(linkLike, (text) => {
        const secret = parseInviteSecret(text)
        expect(secret === null || secret.length === 16).toBe(true)
      }),
      runs
    )
  })

  it('recover the exact secret from a link pasted inside any message', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 16, maxLength: 16 }),
        fc.string({ unit: 'grapheme', maxLength: 60 }),
        fc.string({ unit: 'grapheme', maxLength: 60 }),
        (secret, before, after) => {
          const message = `${before} ${buildInviteLink(secret)} ${after}`
          const found = parseInviteSecret(message)
          expect(found && Array.from(found)).toEqual(Array.from(secret))
        }
      ),
      runs
    )
  })
})

describe('verification scenarios', () => {
  it('stay internally consistent on any day', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('2020-01-01T00:00:00Z'),
          max: new Date('2035-12-31T00:00:00Z'),
          noInvalidDate: true,
        }),
        fc.constantFrom(...SCENARIO_NAMES),
        (now, name) => {
          const scenario = buildScenario(name, now)
          const ids = [
            ...scenario.contacts,
            ...scenario.visits,
            ...scenario.timeEntries,
            ...scenario.dayPlans,
          ].map((record) => record.id)
          expect(new Set(ids).size).toBe(ids.length)
          const contactIds = new Set(scenario.contacts.map((c) => c.id))
          scenario.visits.forEach((visit) =>
            expect(contactIds.has(visit.contact.id)).toBe(true)
          )
          scenario.timeEntries.forEach((entry) =>
            expect(moment(entry.date).isSameOrBefore(now, 'day')).toBe(true)
          )
          scenario.dayPlans.forEach((plan) =>
            expect(moment(plan.date).isAfter(now, 'day')).toBe(true)
          )
        }
      ),
      runs
    )
  })

  it('rejects unknown names with the valid list', () => {
    expect(() => buildScenario('nope')).toThrow(/pioneer/)
  })
})
