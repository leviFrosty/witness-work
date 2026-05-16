import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock(
  '@react-native-async-storage/async-storage',
  () => import('@/__tests__/mocks/asyncStorage')
)
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({ DeviceType: { TABLET: 2 }, deviceType: 1 }))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US' }],
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (k: string) => k },
}))
vi.mock('@/shaders/registry', () => ({
  DEFAULT_SHADER_ID: 'holographic',
}))

import { usePreferences, PREFERENCE_DEFAULTS } from '@/stores/preferences'

const isoSampleStart = '2020-01-01T00:00:00.000Z'

describe('setRole — Tenure reset semantics (glossary: Tenure Start Date)', () => {
  beforeEach(() => {
    // Reset to defaults between tests. Raw setState bypasses the stamping
    // wrapper so each test starts from a clean slate.
    usePreferences.setState({
      ...PREFERENCE_DEFAULTS,
      preferenceUpdatedAt: {},
    })
  })

  it('KEEPS the Tenure Start Date when both roles map to Full-Time Service (regular pioneer → circuit overseer)', () => {
    // Glossary: "regular pioneer → circuit overseer keeps the clock" (both
    // share the Full-Time Service Tenure Type).
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('circuitOverseer')

    const state = usePreferences.getState()
    expect(state.role).toBe('circuitOverseer')
    expect(state.tenureStartDate).toEqual(new Date(isoSampleStart))
  })

  it('KEEPS the Tenure Start Date when both roles are Full-Time Service (regular pioneer → special pioneer)', () => {
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('specialPioneer')

    expect(usePreferences.getState().tenureStartDate).toEqual(
      new Date(isoSampleStart)
    )
  })

  it('KEEPS the Tenure Start Date when staying within the same role (no-op transitions are safe)', () => {
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('regularPioneer')

    expect(usePreferences.getState().tenureStartDate).toEqual(
      new Date(isoSampleStart)
    )
  })

  it('CLEARS the Tenure Start Date when moving across Tenure Types (regular pioneer → regular auxiliary)', () => {
    // Glossary: Full-Time Service and Auxiliary Pioneer are distinct Tenure
    // Types — the clock resets when moving between them.
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('regularAuxiliary')

    const state = usePreferences.getState()
    expect(state.role).toBe('regularAuxiliary')
    expect(state.tenureStartDate).toBeNull()
  })

  it('CLEARS the Tenure Start Date when moving auxiliary → full-time (regular auxiliary → regular pioneer)', () => {
    usePreferences.setState({
      role: 'regularAuxiliary',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('regularPioneer')

    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })

  it('CLEARS the Tenure Start Date when moving from a tenure-tracking role to Regular Publisher (no Tenure Type)', () => {
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('publisher')

    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })

  it('CLEARS the Tenure Start Date when moving from a tenure-tracking role to Custom (no Tenure Type)', () => {
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('custom')

    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })

  it('CLEARS the Tenure Start Date when moving from a non-tenure role to a tenure-tracking one (publisher → regular pioneer)', () => {
    // Sanity: there should be no stale start date on a non-tenure role, but
    // if one somehow exists (e.g. legacy data inconsistency), moving into a
    // tenure-tracking role should NOT auto-promote it — the user must pick a
    // new start date for the new tenure clock. Both roles have null/no
    // tenure type relation here, so the field is cleared.
    usePreferences.setState({
      role: 'publisher',
      tenureStartDate: new Date(isoSampleStart),
    })

    usePreferences.getState().setRole('regularPioneer')

    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })

  it('leaves null Tenure Start Date as null on a same-Tenure-Type transition', () => {
    usePreferences.setState({
      role: 'regularPioneer',
      tenureStartDate: null,
    })

    usePreferences.getState().setRole('circuitOverseer')

    expect(usePreferences.getState().tenureStartDate).toBeNull()
  })
})
