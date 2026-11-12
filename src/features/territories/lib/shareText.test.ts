import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: enUS } = await import('@/locales/en-US.json')
  const i18n = new I18n({ 'en-us': enUS })
  i18n.locale = 'en-us'
  i18n.missingBehavior = 'error'
  return { default: { t: (key: string, o?: object) => i18n.t(key, o) } }
})
import {
  hasOthers,
  linkHeading,
  pickedScopeText,
  recordedByText,
} from '@/features/territories/lib/shareText'
import type { TerritoryStreet } from '@/features/territories/types/territory'

describe('recordedByText', () => {
  it('names you the way it names everyone else', () => {
    const today = new Date()
    today.setHours(14, 31, 0, 0)
    expect(recordedByText(null, today.getTime())).toMatch(/^by you at /)
    expect(recordedByText('Ana Ruiz', today.getTime())).toMatch(
      /^by Ana Ruiz at /
    )
    expect(recordedByText(null, new Date(2026, 0, 5, 10).getTime())).toMatch(
      /^by you on /
    )
  })
})

describe('hasOthers', () => {
  it('is true once anyone else is on the territory', () => {
    expect(hasOthers({})).toBe(false)
    expect(hasOthers({ people: [] })).toBe(false)
    expect(
      hasOthers({ people: [{ id: 'p', name: 'Ben', kind: 'buddy' }] })
    ).toBe(true)
    expect(
      hasOthers({
        received: {
          kind: 'shared',
          from: { id: 'p', name: 'Ana', kind: 'buddy' },
          at: 0,
        },
      })
    ).toBe(true)
  })
})

describe('pickedScopeText', () => {
  const streets = [
    { id: 'a', name: 'Elm Street' },
    { id: 'b', name: 'Oak Street' },
    { id: 'c', name: 'Ash Lane' },
  ]

  it('names the whole territory, one street, or how many streets', () => {
    expect(pickedScopeText(streets, ['a', 'b', 'c'], true)).toBe(
      'Whole Territory'
    )
    expect(pickedScopeText(streets, ['b'], false)).toBe('Oak Street')
    expect(pickedScopeText(streets, ['a', 'c'], false)).toBe('2 streets')
  })

  it('says when nothing is picked', () => {
    expect(pickedScopeText(streets, [], false)).toBe('No streets picked')
    expect(pickedScopeText(streets, ['gone'], false)).toBe('No streets picked')
  })
})

describe('linkHeading', () => {
  const street = (id: string, name: string): TerritoryStreet => ({
    id,
    name,
    numbering: 'both',
    next: 1,
    doors: [],
  })
  const territory = {
    number: '27',
    streets: [street('a', 'Birch Avenue'), street('b', 'Elm Street')],
  }

  it('names the territory before what the link covers', () => {
    expect(linkHeading(territory, {})).toBe('Territory 27 · Whole Territory')
    expect(linkHeading(territory, { streetIds: ['b'] })).toBe(
      'Territory 27 · Elm Street'
    )
    expect(linkHeading(territory, { streetIds: ['b', 'a'] })).toBe(
      'Territory 27 · Whole Territory'
    )
  })
})
