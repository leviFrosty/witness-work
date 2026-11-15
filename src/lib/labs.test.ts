import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isLabOn,
  labDefaultOn,
  resolveLab,
  setLab,
  useLabsStore,
  type LabId,
} from '@/lib/labs'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))

const lab = 'test-lab' as LabId

describe('labs', () => {
  beforeEach(() => useLabsStore.setState({ choices: {} }))

  it('starts labs on in development and Beta, and off in production', () => {
    expect(labDefaultOn('development')).toBe(true)
    expect(labDefaultOn('beta')).toBe(true)
    expect(labDefaultOn('production')).toBe(false)
  })

  it('follows the default until someone flips the switch', () => {
    expect(resolveLab({}, lab, false)).toBe(false)
    expect(resolveLab({}, lab, true)).toBe(true)
    expect(resolveLab({ [lab]: true }, lab, false)).toBe(true)
    expect(resolveLab({ [lab]: false }, lab, true)).toBe(false)
  })

  it('keeps one lab’s choice from changing another', () => {
    expect(resolveLab({ other: false }, lab, true)).toBe(true)
  })

  it('saves a choice and reads it back', () => {
    setLab(lab, false)
    expect(isLabOn(lab)).toBe(false)
    setLab(lab, true)
    expect(isLabOn(lab)).toBe(true)
    expect(useLabsStore.getState().choices).toEqual({ [lab]: true })
  })
})
