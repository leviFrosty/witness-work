import { describe, expect, it } from 'vitest'
import {
  isRedactedContactTombstone,
  retentionCandidates,
  shouldPromptForRetention,
  stripContactForTombstone,
} from '@/lib/dataProtection'
import type { Contact } from '@/types/contact'
import type { Visit } from '@/types/visit'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-22T12:00:00.000Z')

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Anna Householder',
  createdAt: new Date(NOW - 400 * DAY),
  updatedAt: NOW - 400 * DAY,
  ...over,
})

const visit = (contactId: string, daysAgo: number): Visit => ({
  id: `v-${contactId}-${daysAgo}`,
  contact: { id: contactId },
  date: new Date(NOW - daysAgo * DAY),
  isBibleStudy: false,
})

describe('stripContactForTombstone', () => {
  it('keeps only what last-writer-wins sync needs', () => {
    const tombstone = stripContactForTombstone(
      contact({
        phone: '+15550100',
        email: 'anna@example.com',
        address: { line1: '12 Oak St', city: 'Springfield' },
        coordinate: { latitude: 1, longitude: 2 },
        customFields: { 'field-id': 'Lutheran' },
        avatar: { type: 'image', value: 'file:///contact-c1-avatar.jpg' },
        consentGivenAt: '2026-01-01T00:00:00.000Z',
        gender: 'female',
        isFavorite: true,
      }),
      NOW
    )

    expect(Object.keys(tombstone).sort()).toEqual([
      'createdAt',
      'id',
      'name',
      'redacted',
      'updatedAt',
    ])
    expect(tombstone.id).toBe('c1')
    expect(tombstone.updatedAt).toBe(NOW)
    expect(tombstone.name).toBe('')
    expect(isRedactedContactTombstone(tombstone)).toBe(true)
  })

  it('does not leak when the contact was first met', () => {
    const tombstone = stripContactForTombstone(contact(), NOW)
    expect(tombstone.createdAt.getTime()).toBe(NOW)
  })

  it('treats an ordinary soft-delete tombstone as recoverable', () => {
    expect(isRedactedContactTombstone(contact())).toBe(false)
  })
})

describe('retentionCandidates', () => {
  const recentlyTouched = contact({ id: 'fresh', updatedAt: NOW - 3 * DAY })
  const stale = contact({ id: 'stale', updatedAt: NOW - 200 * DAY })

  it('selects contacts with no visit and no edit inside the window', () => {
    const result = retentionCandidates({
      contacts: [recentlyTouched, stale],
      visits: [],
      now: NOW,
    })
    expect(result.map((c) => c.id)).toEqual(['stale'])
  })

  it('keeps a contact visited inside the window even if never edited since', () => {
    const result = retentionCandidates({
      contacts: [stale],
      visits: [visit('stale', 10)],
      now: NOW,
    })
    expect(result).toEqual([])
  })

  it('selects a contact whose only visits are older than the window', () => {
    const result = retentionCandidates({
      contacts: [stale],
      visits: [visit('stale', 300), visit('stale', 120)],
      now: NOW,
    })
    expect(result.map((c) => c.id)).toEqual(['stale'])
  })

  it('ignores visits belonging to other contacts', () => {
    const result = retentionCandidates({
      contacts: [stale],
      visits: [visit('someone-else', 1)],
      now: NOW,
    })
    expect(result.map((c) => c.id)).toEqual(['stale'])
  })

  it('falls back to createdAt when updatedAt predates sync timestamps', () => {
    const legacy: Contact = {
      id: 'legacy',
      name: 'Legacy',
      createdAt: new Date(NOW - 5 * DAY),
    }
    expect(
      retentionCandidates({ contacts: [legacy], visits: [], now: NOW })
    ).toEqual([])
  })

  it('honours a custom retention window', () => {
    const result = retentionCandidates({
      contacts: [recentlyTouched],
      visits: [],
      now: NOW,
      retentionDays: 1,
    })
    expect(result.map((c) => c.id)).toEqual(['fresh'])
  })
})

describe('shouldPromptForRetention', () => {
  it('prompts when the user has never been asked', () => {
    expect(shouldPromptForRetention(undefined, NOW)).toBe(true)
  })

  it('stays quiet inside the interval', () => {
    const at = new Date(NOW - 5 * DAY).toISOString()
    expect(shouldPromptForRetention(at, NOW)).toBe(false)
  })

  it('prompts again once the interval has passed', () => {
    const at = new Date(NOW - 31 * DAY).toISOString()
    expect(shouldPromptForRetention(at, NOW)).toBe(true)
  })
})
