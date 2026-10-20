import enUS from '@/locales/en-US.json'
import type { TranslationKey } from '@/lib/locales'
import {
  cloudSyncOfferedForCopy,
  usesCloudSyncForCopy,
  usesGoogleDriveSync,
} from '@/lib/syncTransport/registry'

/**
 * Sync copy names the service the device syncs through. iCloud strings mention
 * Apple services; where the wording differs, a `<key>Cloud` variant names Cloud
 * Sync (ADR 0030) and a `<key>Android` variant names Google Drive. Returns the
 * variant for this device's sync option when one exists, else `key`.
 */
export function syncKey(key: TranslationKey): TranslationKey {
  if (usesCloudSyncForCopy()) {
    const cloud = `${key}Cloud`
    if (cloud in enUS) return cloud as TranslationKey
  }
  if (!usesGoogleDriveSync()) return key
  const android = `${key}Android`
  return android in enUS ? (android as TranslationKey) : key
}

/**
 * The same, for the platform's own option (iCloud or Google Drive) whatever
 * this device uses: the option picker names both.
 */
export function platformSyncKey(key: TranslationKey): TranslationKey {
  if (!usesGoogleDriveSync()) return key
  const android = `${key}Android`
  return android in enUS ? (android as TranslationKey) : key
}

/**
 * The sync screen's name: "Sync" once it offers Cloud Sync beside iCloud or
 * Google Drive, else the platform's own.
 */
export const syncSettingsTitleKey = (): TranslationKey =>
  cloudSyncOfferedForCopy() ? 'syncSettingsTitle' : syncKey('iCloudSync')
