import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('lucide-react-native', () => ({ WifiOff: 'WifiOff' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { warn: 'warn' } }),
}))
vi.mock('@/lib/color', () => ({ getReadableTextColor: () => 'ink' }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import ScribeOfflineBadge from '@/features/scribe/components/ScribeOfflineBadge'

const render = (props: { size?: number; offset?: number } = {}) => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(<ScribeOfflineBadge ringColor='card' {...props} />)
  })
  return renderer.root.findByType('View' as never)
}

describe('ScribeOfflineBadge', () => {
  it('names itself to screen readers and leaves touches to its control', () => {
    const badge = render()
    expect(badge.props).toMatchObject({
      accessible: true,
      accessibilityRole: 'image',
      accessibilityLabel: 'scribe_offlineBadge',
      pointerEvents: 'none',
    })
  })

  it('sits at the bottom-right corner, ringed in the surface color', () => {
    expect(render().props.style).toMatchObject({
      position: 'absolute',
      right: -5,
      bottom: -5,
      width: 24,
      height: 24,
      borderColor: 'card',
    })
    expect(render({ size: 20, offset: 8 }).props.style).toMatchObject({
      right: 8,
      bottom: 8,
      width: 20,
      height: 20,
    })
  })
})
