import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({
  View: 'View',
  Platform: { OS: 'android' },
}))
vi.mock('lucide-react-native', () => ({
  Fingerprint: 'Fingerprint',
  KeyRound: 'KeyRound',
  LockKeyhole: 'LockKeyhole',
  MonitorX: 'MonitorX',
  MonitorSmartphone: 'MonitorSmartphone',
  TriangleAlert: 'TriangleAlert',
  Users: 'Users',
}))
vi.mock('@/components/ui/ActionButton', () => ({ default: 'ActionButton' }))
vi.mock('@/components/ui/InfoPopover', () => ({ default: 'InfoPopover' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    fonts: {},
    numbers: {},
    fontSize: () => 16,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import KeyChangeIntro from '@/features/settings/components/account/keyChange/KeyChangeIntro'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.restoreAllMocks()
})

describe('KeyChangeIntro', () => {
  it('lists two devices with the same name once each', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    act(() => {
      renderer = create(
        <KeyChangeIntro
          tooOld={[
            { id: 'session-a', name: 'Browser on macOS' },
            { id: 'session-b', name: 'Browser on macOS' },
          ]}
          ownerFailed={false}
          onStart={() => {}}
        />
      )
    })
    const bullets = renderer!.root
      .findAllByType('Text' as never)
      .filter((text) => text.props.children === '• Browser on macOS')
    expect(bullets).toHaveLength(2)
    expect(
      consoleError.mock.calls.some((args) =>
        String(args[0]).includes('same key')
      )
    ).toBe(false)
  })
})
