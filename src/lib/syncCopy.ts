import enUS from '@/locales/en-US.json'
import type { TranslationKey } from '@/lib/locales'
import {
  usesCloudSyncForCopy,
  usesGoogleDriveSync,
} from '@/lib/syncTransport/registry'

export function syncKey(key: TranslationKey): TranslationKey {
  if (usesCloudSyncForCopy()) {
    const cloud = `${key}Cloud`
    if (cloud in enUS) return cloud as TranslationKey
  }
  if (!usesGoogleDriveSync()) return key
  const android = `${key}Android`
  return android in enUS ? (android as TranslationKey) : key
}

export function platformSyncKey(key: TranslationKey): TranslationKey {
  if (!usesGoogleDriveSync()) return key
  const android = `${key}Android`
  return android in enUS ? (android as TranslationKey) : key
}

export function optionSyncKey(
  key: TranslationKey,
  option: 'cloud' | 'platform'
): TranslationKey {
  if (option === 'cloud') {
    const cloud = `${key}Cloud`
    if (cloud in enUS) return cloud as TranslationKey
  }
  return platformSyncKey(key)
}
