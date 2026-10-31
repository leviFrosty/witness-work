import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  View: 'View',
}))
vi.mock('lucide-react-native', () => ({
  Circle: 'Circle',
  CircleCheck: 'CircleCheck',
}))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('Text', props),
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    fontSize: () => 20,
    fonts: { bold: 'bold' },
    colors: { textAlt: 'grey', accent: 'green' },
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import KeyChangeProgress from '@/features/settings/components/account/keyChange/KeyChangeProgress'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function render(confirming: boolean) {
  act(() => {
    renderer = create(
      <KeyChangeProgress stage='confirmed' confirming={confirming} />
    )
  })
  const root = renderer!.root
  return {
    texts: root
      .findAllByType('Text' as never)
      .map((text) => text.props.children),
    spinners: root.findAllByType('ActivityIndicator' as never).length,
    labels: root
      .findAll((node) => typeof node.props.accessibilityLabel === 'string')
      .map((node) => node.props.accessibilityLabel as string),
  }
}

describe('the change in progress', () => {
  it('waits for the passkey with no step running', () => {
    const { texts, spinners, labels } = render(true)
    expect(texts).toContain('accountKeyChange_confirming')
    expect(texts).toContain('accountKeyChange_confirmingDetail')
    expect(texts).not.toContain('accountKeyChange_changing')
    expect(spinners).toBe(0)
    expect(labels).toHaveLength(4)
    for (const label of labels)
      expect(label).toMatch(/accountKeyChange_stageWaiting$/)
  })

  it('runs the commit once confirmed', () => {
    const { texts, spinners, labels } = render(false)
    expect(texts).toContain('accountKeyChange_changing')
    expect(spinners).toBe(1)
    expect(labels[0]).toMatch(/accountKeyChange_stageRunning$/)
  })
})
