import { beforeEach, describe, expect, it, vi } from 'vitest'

const linking = vi.hoisted(() => ({
  openSettings: vi.fn(async () => {}) as (() => Promise<void>) | undefined,
}))
vi.mock('react-native', () => ({ Linking: linking }))

import { openAppSettings } from '@/lib/openAppSettings'

describe('openAppSettings', () => {
  beforeEach(() => {
    linking.openSettings = vi.fn(async () => {})
  })

  it("opens the app's page in Settings on a phone", async () => {
    await openAppSettings()
    expect(linking.openSettings).toHaveBeenCalledOnce()
  })

  it('does nothing in a browser, which has no Settings to open', async () => {
    linking.openSettings = undefined
    await expect(openAppSettings()).resolves.toBeUndefined()
  })
})
