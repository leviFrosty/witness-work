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
  it('opens Apple Maps on Apple OSes on the web, and Google Maps elsewhere', () => {
    const mac = () => true
    const windows = () => false
    expect(resolveNavigationMapProvider(null, 'web', mac)).toBe('apple')
    expect(resolveNavigationMapProvider('apple', 'web', mac)).toBe('apple')
    expect(resolveNavigationMapProvider(null, 'web', windows)).toBe('google')
    expect(resolveNavigationMapProvider('apple', 'web', windows)).toBe('google')
    expect(resolveNavigationMapProvider('google', 'web', mac)).toBe('google')
    expect(resolveNavigationMapProvider('waze', 'web', windows)).toBe('waze')
  })
})
