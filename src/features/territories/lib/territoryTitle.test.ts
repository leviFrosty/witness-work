import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  i18n.missingBehavior = 'error'
  return { default: { t: (key: string, o?: object) => i18n.t(key, o) } }
})
import { shareScopeText } from '@/features/territories/lib/shareText'
import {
  handoffSummary,
  receivedFromText,
  streetDoNotCallSummary,
  territoryListTitle,
  territoryProgressText,
} from '@/features/territories/lib/territoryTitle'
import type {
  Territory,
  TerritoryStreet,
} from '@/features/territories/types/territory'

const street = (patch: Partial<TerritoryStreet> = {}): TerritoryStreet => ({
  id: 's1',
  name: 'Oak Street',
  numbering: 'both',
  next: 1,
  doors: [],
  ...patch,
})

const territory = (streets: TerritoryStreet[]): Territory => ({
  id: 't1',
  number: '14',
  checkedOutAt: 0,
  createdAt: 0,
  streets,
  doNotCalls: [],
})

const handoff = { personId: 'p1', at: new Date(2026, 10, 3).getTime() }

describe('territoryProgressText', () => {
  it('counts every street, a handed-off one as worked once its buddy marks it', () => {
    expect(
      territoryProgressText(
        territory([
          street({ id: 'a', handoff, workedAt: 1 }),
          street({ id: 'b', workedAt: 1 }),
          street({ id: 'c' }),
        ])
      )
    ).toBe('2 of 3 streets worked · 1 handed off')
  })

  it('says street for a territory of one street', () => {
    expect(territoryProgressText(territory([street()]))).toBe(
      '0 of 1 street worked'
    )
    expect(
      territoryProgressText(
        territory([street({ id: 'a', handoff }), street({ id: 'b' })])
      )
    ).toBe('0 of 2 streets worked · 1 handed off')
  })

  it('still reads when every street is handed off', () => {
    expect(territoryProgressText(territory([street({ handoff })]))).toBe(
      '0 of 1 street worked · 1 handed off'
    )
  })
})

describe('handoffSummary', () => {
  it('says who has the street, then when they worked it', () => {
    expect(handoffSummary(street({ handoff }), 'Ben')).toMatch(
      /^Handed to Ben on Nov 3, 2026$/
    )
    expect(
      handoffSummary(
        street({ handoff, workedAt: new Date(2026, 10, 9).getTime() }),
        'Ben'
      )
    ).toMatch(/^Worked by Ben on Nov 9, 2026$/)
  })
})

const from = { id: 'p9', name: 'Ana Ruiz', kind: 'buddy' as const }

describe('received territories', () => {
  it('names an assigned street by its street, a shared one by its number', () => {
    const assigned = {
      ...territory([street({ name: 'Willow Drive' })]),
      name: 'Mill Creek',
      received: { kind: 'handoff' as const, from, at: 0 },
    }
    const shared = {
      ...territory([street()]),
      name: 'Harbor View',
      received: { kind: 'shared' as const, from, at: 0 },
    }
    expect(territoryListTitle(assigned)).toBe('Willow Drive')
    expect(receivedFromText(assigned)).toBe(
      'Handed to you by Ana Ruiz · Territory 14'
    )
    expect(territoryListTitle(shared)).toBe('Territory 14 · Harbor View')
    expect(receivedFromText(shared)).toBe('Shared by Ana Ruiz · Territory 14')
    expect(receivedFromText(territory([]))).toBeUndefined()
  })

  it('never calls an assigned street the whole territory', () => {
    const streets = [street({ id: 'a', name: 'Willow Drive' })]
    expect(shareScopeText(territory(streets), {})).toBe('Whole Territory')
    expect(
      shareScopeText(
        {
          ...territory(streets),
          received: { kind: 'handoff', from, at: 0 },
        },
        {}
      )
    ).toBe('Willow Drive')
  })
})

describe('streetDoNotCallSummary', () => {
  const numbered = { name: 'Birch Avenue', numbering: 'both' } as const
  const unnumbered = { name: 'Market Row', numbering: 'none' } as const
  const door = (label: string) => ({
    label,
    address: `${label} Birch Avenue`,
  })
  const place = (description: string) => ({
    address: `${description}, Market Row`,
  })

  it('names one house so it cannot be read as a count', () => {
    expect(streetDoNotCallSummary(numbered, [door('6')])).toBe(
      'Do not call: house 6'
    )
  })

  it('lists house numbers in walking order on a numbered street', () => {
    expect(
      streetDoNotCallSummary(numbered, [door('9'), door('6'), door('12A')])
    ).toBe('Do not call: houses 6, 9, 12A')
  })

  it('shows the first five numbers then how many more', () => {
    expect(
      streetDoNotCallSummary(
        { ...numbered, numbering: 'odd' },
        ['15', '1', '3', '5', '7', '9', '11', '13'].map(door)
      )
    ).toBe('Do not call: houses 1, 3, 5, 7, 9 +3')
  })

  it('names a door without a number by its description', () => {
    expect(
      streetDoNotCallSummary(unnumbered, [place('Green gate behind the hall')])
    ).toBe('Do not call: Green gate behind the hall')
  })

  it('lists short descriptions that fit', () => {
    expect(
      streetDoNotCallSummary(unnumbered, [place('Door 2'), place('Door 7')])
    ).toBe('Do not call: Door 2, Door 7')
  })

  it('shows the first description then how many more when they do not fit', () => {
    expect(
      streetDoNotCallSummary(unnumbered, [
        place('Green gate behind the hall'),
        place('Blue door above the bakery'),
      ])
    ).toBe('Do not call: Green gate behind the hall +1')
  })

  it('adds a described door after the numbers on a numbered street', () => {
    expect(
      streetDoNotCallSummary(numbered, [
        door('4'),
        { address: 'Flat above the shop, Birch Avenue' },
      ])
    ).toBe('Do not call: house 4, Flat above the shop')
  })

  it('keeps an address on another street whole', () => {
    expect(
      streetDoNotCallSummary(unnumbered, [{ address: '8 Elm Court' }])
    ).toBe('Do not call: 8 Elm Court')
  })
})
