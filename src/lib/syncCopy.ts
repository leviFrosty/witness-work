import enUS from '@/locales/en-US.json'
import type { TranslationKey } from '@/lib/locales'
import { usesGoogleDriveSync } from '@/lib/syncTransport/registry'

/**
 * Sync copy names the service the device syncs through. iCloud strings mention
 * Apple services; where Android's wording differs, an `<key>Android` variant
 * names Google Drive instead. Returns that variant when this device syncs
 * through Google Drive and one exists, else `key`.
 */
export function syncKey(key: TranslationKey): TranslationKey {
  if (!usesGoogleDriveSync()) return key
  const android = `${key}Android`
  return android in enUS ? (android as TranslationKey) : key
}
