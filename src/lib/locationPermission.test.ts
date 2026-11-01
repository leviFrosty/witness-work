import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  request: vi.fn(),
  alert: vi.fn(),
  openSettings: vi.fn(),
}))

vi.mock('react-native', () => ({
  Alert: { alert: mocks.alert },
  Linking: { openSettings: mocks.openSettings },
}))
vi.mock('expo-location', () => ({
  getForegroundPermissionsAsync: mocks.get,
  requestForegroundPermissionsAsync: mocks.request,
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))

import { requestOrOfferLocationSettings } from '@/lib/locationPermission'

type Button = { text: string; onPress?: () => void }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requestOrOfferLocationSettings', () => {
  it('resolves true without asking when location is already allowed', async () => {
    mocks.get.mockResolvedValue({ granted: true, canAskAgain: true })
    await expect(requestOrOfferLocationSettings()).resolves.toBe(true)
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.alert).not.toHaveBeenCalled()
  })

  it('shows the system prompt while it still can', async () => {
    mocks.get.mockResolvedValue({ granted: false, canAskAgain: true })
    mocks.request.mockResolvedValue({ granted: false, canAskAgain: false })
    await expect(requestOrOfferLocationSettings()).resolves.toBe(false)
    expect(mocks.request).toHaveBeenCalledOnce()

    expect(mocks.alert).not.toHaveBeenCalled()
  })

  it('offers Settings once the system stops prompting', async () => {
    mocks.get.mockResolvedValue({ granted: false, canAskAgain: false })
    await expect(requestOrOfferLocationSettings()).resolves.toBe(false)
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.alert).toHaveBeenCalledOnce()

    const [title, message, buttons] = mocks.alert.mock.calls[0] as [
      string,
      string,
      Button[],
    ]
    expect(title).toBe('locationSharingDisabled')
    expect(message).toBe('locationSettings_description')
    expect(buttons.map((button) => button.text)).toEqual([
      'cancel',
      'locationDisabled_callToAction',
    ])
    buttons[1].onPress?.()
    expect(mocks.openSettings).toHaveBeenCalledOnce()
  })
})
