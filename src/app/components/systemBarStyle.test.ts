import { describe, expect, it } from 'vitest'
import { systemBarStyle } from '@/app/components/systemBarStyle'

describe('systemBarStyle', () => {
  it('follows the system when no appearance is chosen', () => {
    expect(systemBarStyle(undefined, 'dark')).toBe('light')
    expect(systemBarStyle(undefined, 'light')).toBe('dark')
    expect(systemBarStyle(undefined, null)).toBe('dark')
  })

  it('follows the chosen appearance over the system', () => {
    expect(systemBarStyle('dark', 'light')).toBe('light')
    expect(systemBarStyle('light', 'dark')).toBe('dark')
  })
})
