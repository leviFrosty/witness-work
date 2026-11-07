import type { SyncOption } from '@/app/sync/syncOption'

export function syncSettingsMode({
  web,
  cloudRegistered,
  cloudSyncConfigEnabled,
  chosenProvider,
  option,
}: {
  web: boolean
  cloudRegistered: boolean
  cloudSyncConfigEnabled: boolean | undefined
  chosenProvider: string | null | undefined
  option: SyncOption
}): { optionPicker: boolean; onCloud: boolean; rebuild: boolean } {
  if (web) return { optionPicker: true, onCloud: true, rebuild: false }
  return {
    rebuild: true,
    optionPicker:
      cloudRegistered &&
      (cloudSyncConfigEnabled === true || chosenProvider === 'cloud'),
    onCloud: option === 'cloud',
  }
}
