import type { SyncOption } from '@/app/sync/syncOption'

/**
 * What Settings → Sync shows. Phones pick between Cloud Sync, iCloud or Google
 * Drive, and Off once Cloud Sync is offered (the server's switch is on, or this
 * device already chose it), and show the old iCloud or Drive toggle otherwise.
 * The web has only Cloud Sync (ADR 0037 §2), so it always shows the picker and
 * is always on Cloud Sync, also before the server's config loads and while its
 * switch is off (which shows as paused). It never shows the iCloud toggle, or
 * Rebuild, which would publish what the browser holds over every phone's data.
 */
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
