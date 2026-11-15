import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Alert: { alert: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { Alert, type AlertButton } from 'react-native'
import confirmDataProtectionOn from '@/lib/confirmDataProtectionOn'

function shown() {
  const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[0]
  return { title, message, buttons: buttons as AlertButton[] }
}

describe('Turn on data protection mode alert', () => {
  beforeEach(() => vi.clearAllMocks())

  it('warns before turning it on', () => {
    const onConfirm = vi.fn()
    confirmDataProtectionOn(onConfirm)
    const { title, message, buttons } = shown()
    expect([title, message]).toEqual([
      'dataProtectionTurnOnTitle',
      'dataProtectionTurnOnDesc',
    ])
    expect(buttons.map((b) => b.text)).toEqual([
      'cancel',
      'dataProtectionTurnOnAction',
    ])
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('turns it on only when the User confirms', () => {
    const onConfirm = vi.fn()
    confirmDataProtectionOn(onConfirm)
    const { buttons } = shown()
    buttons[0].onPress?.()
    expect(onConfirm).not.toHaveBeenCalled()
    buttons[1].onPress?.()
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
