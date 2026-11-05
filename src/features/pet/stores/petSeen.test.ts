import { describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('react-native-mmkv', () => ({ MMKV: class {} }))

import { migratePetSeen } from '@/features/pet/stores/petSeen'

describe('migratePetSeen', () => {
  it('carries the coins last shown into the new coin units', () => {
    expect(
      migratePetSeen({ seen: { pet: 'seed', coins: 37, hearts: 4 } }, 1)
    ).toEqual({ seen: { pet: 'seed', coins: 370, hearts: 4 } })
  })

  it('leaves a current or empty record alone', () => {
    const current = { seen: { pet: 'seed', coins: 370, hearts: 4 } }
    expect(migratePetSeen(current, 2)).toBe(current)
    expect(migratePetSeen({ seen: null }, 1)).toEqual({ seen: null })
  })
})
