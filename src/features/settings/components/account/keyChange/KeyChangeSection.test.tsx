import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  showAlert: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: 'View',
}))
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: vi.fn() }),
}))
vi.mock('lucide-react-native', () => ({
  RotateCcwKey: 'RotateCcwKey',
  ScanQrCode: 'ScanQrCode',
  Trash2: 'Trash2',
}))
vi.mock('@/components/ui/inputs/Section', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/components/ui/inputs/InputRowButton', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('RowButton', props),
}))
vi.mock('@/features/settings/components/shared/SectionTitle', () => ({
  default: 'SectionTitle',
}))
vi.mock('@/features/settings/components/account/SectionFooter', () => ({
  default: 'SectionFooter',
}))
vi.mock('@/app/account/keyChange', () => ({
  keyChange: {
    current: mocks.current,
    discard: vi.fn(async () => undefined),
    resume: vi.fn(async () => ({ state: 'none' })),
  },
}))
vi.mock('@/app/account/keyChange/engine', () => ({
  KeyChangeError: class KeyChangeError extends Error {},
}))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/dates', () => ({ formatDate: () => 'a day' }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/alert', () => ({ showAlert: mocks.showAlert }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/stores/toasts', () => ({ toast: { info: vi.fn(), error: vi.fn() } }))

import { useKeyChangeStatus } from '@/app/account/keyChange/status'
import KeyChangeSection from '@/features/settings/components/account/keyChange/KeyChangeSection'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  vi.clearAllMocks()
})

async function discardBody(current: unknown) {
  mocks.current.mockResolvedValue(current)
  useKeyChangeStatus.setState({ stage: 'confirmed' })
  act(() => {
    renderer = create(<KeyChangeSection />)
  })
  const discard = renderer!.root
    .findAllByType('RowButton' as never)
    .find((row) => row.props.label === 'accountKeyChange_resumeDiscard')!
  await act(async () => {
    discard.props.onPress()
  })
  expect(mocks.showAlert).toHaveBeenCalledTimes(1)
  return mocks.showAlert.mock.calls[0][1]
}

describe('discarding an unfinished change', () => {
  it('says the current recovery key keeps working while it’s still held', async () => {
    expect(
      await discardBody({
        stage: 'confirmed',
        startedAt: 1,
        otherKeyHeld: false,
      })
    ).toBe('accountKeyChange_discardBody')
  })

  it('says the key already changed elsewhere once another key is held', async () => {
    expect(
      await discardBody({
        stage: 'confirmed',
        startedAt: 1,
        otherKeyHeld: true,
      })
    ).toBe('accountKeyChange_discardBodyReplaced')
  })

  it('keeps the usual line when the change can’t be read', async () => {
    mocks.current.mockRejectedValueOnce(new Error('locked'))
    useKeyChangeStatus.setState({ stage: 'pending' })
    act(() => {
      renderer = create(<KeyChangeSection />)
    })
    const discard = renderer!.root
      .findAllByType('RowButton' as never)
      .find((row) => row.props.label === 'accountKeyChange_resumeDiscard')!
    await act(async () => {
      discard.props.onPress()
    })
    expect(mocks.showAlert.mock.calls[0][1]).toBe(
      'accountKeyChange_discardBody'
    )
  })
})
