import { describe, expect, it } from 'vitest'
import { resolveNavigationMapProvider } from '@/lib/navigationMapProvider'

describe('navigation provider', () => {
  it('uses Google Maps for an Apple Maps preference restored on Android', () => {
    expect(resolveNavigationMapProvider('apple', 'android')).toBe('google')
    expect(resolveNavigationMapProvider(null, 'android')).toBe('google')
  })
  it('preserves available navigation choices', () => {
    expect(resolveNavigationMapProvider('apple', 'ios')).toBe('apple')
    expect(resolveNavigationMapProvider('waze', 'android')).toBe('waze')
    expect(resolveNavigationMapProvider('google', 'android')).toBe('google')
  })
})
