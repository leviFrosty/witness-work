import { fromUtf8, utf8 } from '@/lib/bytes'
import {
  type KeyChangeRecordStore,
  parseKeyChangeRecord,
} from '@/lib/accountKey/keyChangeRecord'
import {
  type SealedSecrets,
  sealedSecrets,
} from '@/lib/webStorage/sealedSecrets'
import { secureKv } from '@/lib/webStorage/secureKv'

const SECRET = 'account-key-change'

/**
 * The web's change record: sealed in IndexedDB beside the account key
 * (`sealedSecrets`, docs/web-storage.md), so it stays in this browser, is never
 * synced, and goes when the browser is wiped. `available` is false where the
 * browser can't seal (no IndexedDB or WebCrypto): the change doesn't start
 * there.
 */
export function createWebKeyChangeRecordStore({
  secrets,
  available,
}: {
  secrets: Pick<SealedSecrets, 'read' | 'write'>
  available: boolean
}): KeyChangeRecordStore & { isAvailable: () => boolean } {
  return {
    isAvailable: () => available,
    read: async () => {
      const sealed = await secrets.read(SECRET)
      return sealed ? parseKeyChangeRecord(fromUtf8(sealed)) : null
    },
    write: (record) => secrets.write(SECRET, utf8(JSON.stringify(record))),
    remove: () => secrets.write(SECRET, null),
  }
}

/** This browser's change record. */
export const webKeyChangeRecordStore = createWebKeyChangeRecordStore({
  secrets: sealedSecrets,
  available:
    secureKv.available && typeof globalThis.crypto?.subtle === 'object',
})
