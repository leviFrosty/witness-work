import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/locales', async () => {
  const { I18n } = await import('i18n-js')
  const { default: en } = await import('@/locales/en-US.json')
  const i18n = new I18n({ en }, { locale: 'en' })
  return { default: i18n, _i18n: i18n }
})

import {
  personExportName,
  personFilterLabels,
  personLabel,
} from '@/features/mileage/lib/personLabel'
import type { CarPerson } from '@/lib/mileage/people'

const person = (
  key: string,
  name: string,
  spaceId: string,
  extra: Partial<CarPerson> = {}
): CarPerson => ({
  key,
  spaceId,
  memberId: key,
  name,
  avatar: { type: 'none', value: '' },
  me: false,
  buddy: false,
  owner: false,
  current: true,
  ...extra,
})

const cars: Record<string, string> = {
  van: 'Family Minivan',
  mazda: 'Mazda CX-5',
}
const carName = (spaceId: string) => cars[spaceId]

describe('people as the app names them', () => {
  it('reads the User as “You”, and someone unnamed as “Someone”', () => {
    expect(personLabel({ me: true, name: 'Levi' })).toBe('You')
    expect(personLabel({ me: false, name: 'Ana' })).toBe('Ana')
    expect(personLabel({ me: false, name: '' })).toBe('Someone')
  })

  it('names the User by their own name in a report, else “Me”', () => {
    expect(personExportName({ me: true, name: 'Levi' }, 'Levi W.')).toBe(
      'Levi W.'
    )
    expect(personExportName({ me: true, name: 'Levi' })).toBe('Me')
    expect(personExportName({ me: false, name: 'Ana' }, 'Levi W.')).toBe('Ana')
  })
})

describe('the person filter’s labels', () => {
  it('are each person’s name when no two share one', () => {
    const labels = personFilterLabels(
      [person('a', 'Ana', 'van'), person('b', 'Ben', 'mazda')],
      carName
    )
    expect([...labels]).toEqual([
      ['a', 'Ana'],
      ['b', 'Ben'],
    ])
  })

  it('tell apart one name on two cars by car', () => {
    const labels = personFilterLabels(
      [
        person('van/ben', 'Ben', 'van'),
        person('mazda/ben', 'Ben', 'mazda'),
        person('a', 'Ana', 'van'),
      ],
      carName
    )
    expect(labels.get('van/ben')).toBe('Ben · Family Minivan')
    expect(labels.get('mazda/ben')).toBe('Ben · Mazda CX-5')
    expect(labels.get('a')).toBe('Ana')
  })

  it('leave a buddy by their name beside someone else with it', () => {
    const labels = personFilterLabels(
      [
        person('buddy:ben', 'Ben', 'mazda', { buddy: true }),
        person('van/ben', 'Ben', 'van'),
      ],
      carName
    )
    expect(labels.get('buddy:ben')).toBe('Ben')
    expect(labels.get('van/ben')).toBe('Ben · Family Minivan')
  })

  it('call someone with no name “Someone”', () => {
    const labels = personFilterLabels([person('x', '', 'van')], carName)
    expect(labels.get('x')).toBe('Someone')
  })
})
