import { getRandomBytes } from 'expo-crypto'
import * as FileSystem from 'expo-file-system/legacy'
import { sha256 } from '@noble/hashes/sha2.js'
import { analytics } from '@/lib/analytics'
import { toB64u, utf8 } from '@/lib/bytes'
import { deviceName, devicePlatform } from '@/lib/devicePlatform'
import { ensureSyncDeviceId } from '@/lib/iCloudIdentity'
import { logger } from '@/lib/logger'
import {
  cachedServerAccount,
  olderAccountKeys,
  olderPhotoKeys,
  peekAccountKey,
} from '@/lib/serverAccount'
import { syncNow } from '@/lib/syncClock'
import { syncFilenameForDevice } from '@/lib/syncDevices'
import { registerPlatformSealer } from '@/lib/syncTransport'
import type { SealKeyring } from '@/lib/syncTransport/sealed/sealCrypto'
import {
  createSealedTransport,
  type SealingEvent,
} from '@/lib/syncTransport/sealed/sealedTransport'
import { setSealingStatus } from '@/lib/syncTransport/sealed/sealingStatus'
import { derivePhotoKeys } from '@/lib/syncTransport/server/photoCrypto'
import { photoFiles } from '@/lib/syncTransport/server/photoFiles'
import { deriveSyncKey } from '@/lib/syncTransport/server/syncCrypto'
import type { SyncTransport } from '@/lib/syncTransport/types'
import { usePreferences } from '@/stores/preferences'

let derived: { seed: string; keys: SealKeyring['current'] } | null = null

async function keyring(): Promise<SealKeyring | null> {
  const accountKey = await peekAccountKey()
  if (!accountKey) return null
  const seed = toB64u(accountKey)
  if (derived?.seed !== seed)
    derived = {
      seed,
      keys: {
        syncKey: deriveSyncKey(accountKey),
        photoKeys: derivePhotoKeys(accountKey),
      },
    }
  const accountId = cachedServerAccount()?.accountId
  if (!accountId) return { current: derived.keys, older: [] }
  const [syncKeys, photoKeys] = await Promise.all([
    olderAccountKeys(accountId, 'sync'),
    olderPhotoKeys(accountId),
  ])
  return {
    current: derived.keys,
    older: syncKeys.flatMap((syncKey, index) =>
      photoKeys[index]
        ? [
            {
              syncKey,
              photoKeys: {
                photoKey: photoKeys[index].photo,
                nameKey: photoKeys[index].name,
              },
            },
          ]
        : []
    ),
  }
}

const identityHash = (identity: string | null) =>
  toB64u(sha256(utf8(identity ?? 'none'))).slice(0, 22)

const SCRATCH = `${FileSystem.documentDirectory ?? ''}sealed-sync/`
let scratchReady: Promise<void> | null = null
const ensureScratch = () =>
  (scratchReady ??= FileSystem.makeDirectoryAsync(SCRATCH, {
    intermediates: true,
  }).catch(() => {
    scratchReady = null
  }))

const files = {
  read: photoFiles.read,
  async write(path: string, bytes: Uint8Array) {
    await ensureScratch()
    await photoFiles.write(path, bytes)
  },
  remove: (path: string) => FileSystem.deleteAsync(path, { idempotent: true }),
  tempPath: () => `${SCRATCH}${toB64u(getRandomBytes(12))}.bin`,
}

const countOf = (holdups: { reason: string }[], reason: string) =>
  holdups.filter((holdup) => holdup.reason === reason).length

function reportEvent(transport: SyncTransport['kind'], event: SealingEvent) {
  switch (event.type) {
    case 'waiting':
      if (event.waitingFor === 'read') return
      analytics.capture('platform_sync_sealing_waiting', {
        transport,
        reason: event.waitingFor,
        update_devices: countOf(event.holdups, 'update'),
        other_account_devices: countOf(event.holdups, 'other-account'),
        no_key_devices: countOf(event.holdups, 'no-key'),
      })
      return
    case 'started':
      analytics.capture('platform_sync_sealing_started', { transport })
      return
    case 'completed':
      analytics.capture('platform_sync_sealing_completed', { transport })
      return
    case 'failed':
      logger.warn('[platformSealing] sealing step failed', event)
      analytics.capture('platform_sync_sealing_failed', {
        transport,
        reason: event.step,
        code: event.code,
      })
      return
    case 'photos':
      analytics.capture('platform_sync_photos_sealed', {
        transport,
        sealed: event.sealed,
        failed: event.failed,
        remaining:
          event.remaining === 0 ? '0' : event.remaining < 100 ? '<100' : '100+',
      })
      return
    case 'device-resealed':
      logger.log('[platformSealing] sealed a quiet device’s snapshot')
  }
}

export function sealPlatformTransport(inner: SyncTransport) {
  return createSealedTransport(inner, {
    keyring,
    sealingSwitch: () => usePreferences.getState().platformSyncSealing,
    remembered: {
      has: (identity) =>
        usePreferences
          .getState()
          .platformSyncSealedFor.includes(identityHash(identity)),
      add: (identity) => {
        const hash = identityHash(identity)
        const { platformSyncSealedFor } = usePreferences.getState()
        if (platformSyncSealedFor.includes(hash)) return
        usePreferences.setState({
          platformSyncSealedFor: [...platformSyncSealedFor, hash].slice(-8),
        })
      },
    },
    files,
    randomBytes: getRandomBytes,
    now: syncNow,
    deviceName: deviceName,
    platform: devicePlatform(),
    ownFilename: () => syncFilenameForDevice(ensureSyncDeviceId()),
    pause: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    onEvent: (event) => reportEvent(inner.kind, event),
    onStatus: setSealingStatus,
  })
}

export function registerPlatformSealing(): void {
  registerPlatformSealer(sealPlatformTransport)
}
