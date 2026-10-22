import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  View: 'View',
  useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }),
}))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: new Proxy({}, { get: () => '#000' }),
    fonts: new Proxy({}, { get: () => 'font' }),
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/features/scribe/components/ScribeOrb', () => ({
  default: 'ScribeOrb',
}))

import ScribeVoiceStage from '@/features/scribe/components/ScribeVoiceStage'

const render = () => {
  let renderer!: ReactTestRenderer
  act(() => {
    renderer = create(
      <ScribeVoiceStage
        orb='listening'
        level={{ value: 0 } as never}
        orbLabel='Listening'
        title='Listening'
        subtitle={null}
      />
    )
  })
  const all = (type: string) =>
    renderer.root.findAll((node) => (node.type as unknown) === type)
  const views = () => all('View')
  const measure = (view: number, height: number) =>
    act(() =>
      views()[view].props.onLayout({ nativeEvent: { layout: { height } } })
    )
  return {
    orbSize: () => all('ScribeOrb')[0].props.size,
    layout: (height: number) => measure(0, height),
    lines: (height: number) => measure(1, height),
  }
}

describe('ScribeVoiceStage', () => {
  it('fits the width on a tall sheet', () => {
    const { orbSize, layout } = render()
    layout(420)
    expect(orbSize()).toBe(340)
  })

  it('shrinks the orb on a short sheet so its lines clear the controls', () => {
    const { orbSize, layout } = render()
    layout(300)
    expect(orbSize()).toBe(260)
  })

  it('shrinks it further when large text makes the lines taller', () => {
    const { orbSize, layout, lines } = render()
    layout(300)
    lines(150)
    expect(orbSize()).toBe(162)
  })

  it('never shrinks it past a floor', () => {
    const { orbSize, layout } = render()
    layout(80)
    expect(orbSize()).toBe(96)
  })
})
