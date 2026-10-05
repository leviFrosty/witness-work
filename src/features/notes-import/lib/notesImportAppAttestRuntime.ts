import * as Crypto from 'expo-crypto'
import { MMKV } from 'react-native-mmkv'
import { getOrCreateAccountId } from '@/lib/account'
import { getOrCreateInstallId } from '@/lib/installId'
import { createNotesImportAppAttest } from '@/features/notes-import/lib/notesImportAppAttest'
import {
  notesImportBaseUrl,
  notesImportDevBypass,
  notesImportTransport,
} from '@/features/notes-import/lib/notesImportTransport'
import * as AppAttest from '../../../../modules/app-attest'
import * as KeychainUuid from '../../../../modules/keychain-uuid'

let _legacyStore: MMKV | null = null
const legacyStore = (): MMKV =>
  (_legacyStore ??= new MMKV({ id: 'app-attest' }))

let _journalStore: MMKV | null = null
const journalStore = (): MMKV => {
  if (_journalStore) return _journalStore
  // A separate encrypted instance keeps replay-capable lifecycle blobs useless
  // if the Documents-backed MMKV files are restored onto another device. OTA JS
  // on an older binary must use legacy MMKV for contained v1 response-loss
  // replay: those records contain no recovery token/private key, and an App
  // Attest attestation is a public proof bound to its one-time server challenge.
  // This narrow confidentiality exception prevents the deployed v1 binary from
  // losing a successfully registered key when the HTTP response is interrupted.
  _journalStore = KeychainUuid.supportsAppAttestRecoveryStorage()
    ? new MMKV({
        id: 'app-attest-lifecycle-v2',
        encryptionKey: KeychainUuid.getOrCreateAppAttestJournalKey(),
      })
    : legacyStore()
  return _journalStore
}
const LEGACY_KEY_ID_KEY = 'keyId'
const LIFECYCLE_JOURNAL_KEY = 'lifecycleJournalV2'

const readLifecycleJournal = (): string | null => {
  const store = journalStore()
  const encrypted = store.getString(LIFECYCLE_JOURNAL_KEY) ?? null
  if (!KeychainUuid.supportsAppAttestRecoveryStorage()) return encrypted

  const legacy = legacyStore().getString(LIFECYCLE_JOURNAL_KEY) ?? null
  if (encrypted !== null) {
    // Complete cleanup if a prior migration wrote the encrypted copy but stopped
    // before deleting the legacy value.
    if (legacy !== null) legacyStore().delete(LIFECYCLE_JOURNAL_KEY)
    return encrypted
  }
  if (legacy === null) return null

  // Native upgrades switch journalStore() to encrypted MMKV. Preserve an exact
  // pending v1 registration before removing its old-binary plaintext copy.
  store.set(LIFECYCLE_JOURNAL_KEY, legacy)
  legacyStore().delete(LIFECYCLE_JOURNAL_KEY)
  return legacy
}

const writeLifecycleJournal = (journal: string): void => {
  journalStore().set(LIFECYCLE_JOURNAL_KEY, journal)
  if (KeychainUuid.supportsAppAttestRecoveryStorage()) {
    legacyStore().delete(LIFECYCLE_JOURNAL_KEY)
  }
}

const clearLifecycleJournal = (): void => {
  journalStore().delete(LIFECYCLE_JOURNAL_KEY)
  if (KeychainUuid.supportsAppAttestRecoveryStorage()) {
    legacyStore().delete(LIFECYCLE_JOURNAL_KEY)
  }
}

const recoveryTokenHash = async (token: string): Promise<string> => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new Error('Invalid Notes Import recovery token')
  }
  const padded = `${token.replace(/-/g, '+').replace(/_/g, '/')}=`
  const binary = globalThis.atob(padded)
  const tokenBytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    tokenBytes[index] = binary.charCodeAt(index)
  }
  if (tokenBytes.length !== 32) {
    throw new Error('Invalid Notes Import recovery token')
  }
  const digest = new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, tokenBytes)
  )
  let digestBinary = ''
  for (const byte of digest) digestBinary += String.fromCharCode(byte)
  return globalThis
    .btoa(digestBinary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export const notesImportAppAttest = createNotesImportAppAttest({
  appAttest: {
    isSupported: AppAttest.isSupported,
    generateKey: AppAttest.generateKey,
    attestKey: AppAttest.attestKey,
    generateAssertion: AppAttest.generateAssertion,
    classifyError: AppAttest.classifyError,
  },
  secureStore: {
    supportsRecoveryStorage: KeychainUuid.supportsAppAttestRecoveryStorage,
    readActiveKeyId: KeychainUuid.readAppAttestKeyId,
    writeActiveKeyId: KeychainUuid.writeAppAttestKeyId,
    readRecoveryToken: KeychainUuid.readAppAttestRecoveryToken,
    getOrCreateRecoveryToken: KeychainUuid.getOrCreateAppAttestRecoveryToken,
    readRecoveryEnrollmentKeyId:
      KeychainUuid.readAppAttestRecoveryEnrollmentKeyId,
    writeRecoveryEnrollmentKeyId:
      KeychainUuid.writeAppAttestRecoveryEnrollmentKeyId,
  },
  persistence: {
    readJournal: readLifecycleJournal,
    writeJournal: writeLifecycleJournal,
    clearJournal: clearLifecycleJournal,
    readLegacyKeyId: () => legacyStore().getString(LEGACY_KEY_ID_KEY) ?? null,
    mirrorLegacyKeyId: (keyId) => legacyStore().set(LEGACY_KEY_ID_KEY, keyId),
  },
  identity: {
    peekUuid: KeychainUuid.peek,
    getOrCreateUuid: getOrCreateInstallId,
    getAccountId: getOrCreateAccountId,
  },
  crypto: {
    sha256Base64: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
        encoding: Crypto.CryptoEncoding.BASE64,
      }),
    sha256Hex: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
        encoding: Crypto.CryptoEncoding.HEX,
      }),
    recoveryTokenHash,
    randomUuid: Crypto.randomUUID,
  },
  transport: notesImportTransport,
  devBypass: notesImportDevBypass,
  baseUrl: notesImportBaseUrl,
  now: Date.now,
})

export const prepareNotesImportAppAttestRecovery = (): Promise<void> =>
  notesImportAppAttest.prepareRecovery()
