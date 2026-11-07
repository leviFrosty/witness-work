import React from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'ios' }))
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platform.OS
    },
    select: (choices: Record<string, unknown>) =>
      platform.OS in choices ? choices[platform.OS] : choices.default,
  },
}))
vi.mock('lucide-react-native', () => ({ CircleCheckBig: 'CircleCheckBig' }))
vi.mock('@/features/settings/components/account/handoff/HandoffStatus', () => ({
  default: 'HandoffStatus',
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import KeyChangeDone from '@/features/settings/components/account/keyChange/KeyChangeDone'

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
})

function render(passkeyUnlocks: boolean | null) {
  const onDone = vi.fn()
  const onAddPasskey = vi.fn()
  act(() => {
    renderer = create(
      <KeyChangeDone
        passkeyUnlocks={passkeyUnlocks}
        onDone={onDone}
        onAddPasskey={onAddPasskey}
      />
    )
  })
  const status = renderer!.root.findByType('HandoffStatus' as never).props
  return { status, onDone, onAddPasskey }
}

describe('the done screen', () => {
  it('offers Add a Passkey when no passkey unlocks with the new key', () => {
    const { status, onAddPasskey } = render(false)
    expect(status.detail).toBe('accountKeyChange_doneAddPasskeyWeb')
    expect(status.secondary.label).toBe('passkeys_add')
    act(() => status.secondary.onPress())
    expect(onAddPasskey).toHaveBeenCalledOnce()
  })

  it('offers nothing more when a passkey unlocks, or nobody asked', () => {
    for (const unlocks of [true, null]) {
      const { status } = render(unlocks)
      expect(status.detail).toBeUndefined()
      expect(status.secondary).toBeUndefined()
      expect(status.title).toBe('accountKeyChange_doneTitle')
      act(() => renderer?.unmount())
      renderer = undefined
    }
  })

  it('names no QR code from this device in a browser, which can’t show one', () => {
    platform.OS = 'web'
    try {
      expect(render(false).status.body).toBe('accountKeyChange_doneBodyWeb')
    } finally {
      platform.OS = 'ios'
    }
    act(() => renderer?.unmount())
    renderer = undefined
    expect(render(null).status.body).toBe('accountKeyChange_doneBody')
  })
})
