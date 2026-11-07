import { describe, expect, it } from 'vitest'
import { syncSettingsMode } from '@/features/settings/lib/syncSettingsMode'

const phone = {
  web: false,
  cloudRegistered: true,
  cloudSyncConfigEnabled: true,
  chosenProvider: undefined,
  option: 'off' as const,
}

describe('syncSettingsMode', () => {
  it.each([
    ['before the server config loads', { cloudSyncConfigEnabled: undefined }],
    ["while the server's switch is off", { cloudSyncConfigEnabled: false }],
    ['before Cloud Sync registers', { cloudRegistered: false }],
    ['on any option', { option: 'platform' as const }],
  ])(
    'shows the web only the Cloud Sync picker, never the iCloud toggle, %s',
    (_, over) => {
      expect(syncSettingsMode({ ...phone, web: true, ...over })).toEqual({
        optionPicker: true,
        onCloud: true,
        rebuild: false,
      })
    }
  )

  it('shows a phone the picker once Cloud Sync is offered', () => {
    expect(syncSettingsMode(phone)).toEqual({
      optionPicker: true,
      onCloud: false,
      rebuild: true,
    })
    expect(syncSettingsMode({ ...phone, option: 'cloud' })).toEqual({
      optionPicker: true,
      onCloud: true,
      rebuild: true,
    })
  })

  it("keeps a phone on Cloud Sync's picker while the switch pauses it", () => {
    expect(
      syncSettingsMode({
        ...phone,
        cloudSyncConfigEnabled: false,
        chosenProvider: 'cloud',
      }).optionPicker
    ).toBe(true)
  })

  it('shows a phone the iCloud or Drive toggle while Cloud Sync is not offered', () => {
    expect(
      syncSettingsMode({ ...phone, cloudSyncConfigEnabled: false })
    ).toEqual({ optionPicker: false, onCloud: false, rebuild: true })
    expect(
      syncSettingsMode({ ...phone, cloudRegistered: false }).optionPicker
    ).toBe(false)
  })
})
