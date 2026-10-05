import { describe, expect, it } from 'vitest'
import { planWatchEntries } from '@/app/watch/planWatchEntries'
import { normalizeDateForStorage } from '@/lib/normalizeDate'
import type { WatchEntryDraft } from '../../modules/watch-bridge'
import type { Category } from '@/types/category'

const draft = (overrides: Partial<WatchEntryDraft> = {}): WatchEntryDraft => ({
  id: 'watch-1',
  date: '2026-10-04',
  hours: 1,
  minutes: 30,
  categoryId: null,
  origin: 'app',
  ...overrides,
})

const bethel: Category = { id: 'bethel', name: 'Bethel', isCredit: true }

const empty = {
  serviceReports: {},
  deletedServiceReports: [],
  categories: [bethel],
}

describe('planWatchEntries', () => {
  it('adds a new entry under the watch id on the watch’s day', () => {
    const [plan] = planWatchEntries([draft()], empty)

    expect(plan.status).toBe('add')
    if (plan.status !== 'add') return
    expect(plan.entry).toMatchObject({
      id: 'watch-1',
      hours: 1,
      minutes: 30,
      categoryId: undefined,
      credit: false,
    })
    expect(normalizeDateForStorage(plan.entry.date).toISOString()).toBe(
      '2026-10-04T12:00:00.000Z'
    )
  })

  it('takes credit from the chosen Category', () => {
    const [plan] = planWatchEntries([draft({ categoryId: 'bethel' })], empty)

    expect(plan).toMatchObject({
      status: 'add',
      categoryRemoved: false,
      entry: { categoryId: 'bethel', credit: true },
    })
  })

  it('keeps the time as Standard when the Category was deleted', () => {
    const [plan] = planWatchEntries([draft({ categoryId: 'gone' })], empty)

    expect(plan).toMatchObject({
      status: 'add',
      categoryRemoved: true,
      entry: { categoryId: undefined, credit: false },
    })
  })

  it('recognizes an entry that is already saved', () => {
    const plans = planWatchEntries([draft()], {
      ...empty,
      serviceReports: {
        2026: {
          9: [{ id: 'watch-1', date: new Date(), hours: 1, minutes: 30 }],
        },
      },
    })

    expect(plans).toEqual([{ id: 'watch-1', status: 'duplicate' }])
  })

  it('adds a repeated delivery in the same batch once', () => {
    const plans = planWatchEntries([draft(), draft()], empty)

    expect(plans.map((plan) => plan.status)).toEqual(['add', 'duplicate'])
  })

  it('does not restore an entry deleted before it arrived', () => {
    const plans = planWatchEntries([draft()], {
      ...empty,
      deletedServiceReports: [{ id: 'watch-1', deletedAt: 1 }],
    })

    expect(plans).toEqual([{ id: 'watch-1', status: 'deleted' }])
  })

  it('accepts the 0h 0m shared-in-ministry marker', () => {
    const [plan] = planWatchEntries([draft({ hours: 0, minutes: 0 })], empty)

    expect(plan.status).toBe('add')
  })

  it.each([
    ['a malformed date', { date: '2026-13-40' }],
    ['a non-Gregorian date string', { date: '10/04/2026' }],
    ['fractional hours', { hours: 1.5 }],
    ['out-of-range minutes', { minutes: 60 }],
    ['negative hours', { hours: -1 }],
    ['an empty id', { id: '' }],
    ['an unknown origin', { origin: 'web' as WatchEntryDraft['origin'] }],
  ])('rejects %s', (_label, overrides) => {
    const [plan] = planWatchEntries([draft(overrides)], empty)

    expect(plan.status).toBe('invalid')
  })
})
