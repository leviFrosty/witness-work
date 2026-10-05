import * as Crypto from 'expo-crypto'
import { getOrCreateAccountId } from '@/lib/account'
import { getOrCreateInstallId } from '@/lib/installId'
import { createNotesImportPlayIntegrity } from '@/features/notes-import/lib/notesImportPlayIntegrity'
import {
  notesImportBaseUrl,
  notesImportDevBypass,
  notesImportTransport,
} from '@/features/notes-import/lib/notesImportTransport'
import * as PlayIntegrity from '../../../../modules/play-integrity'

export const notesImportPlayIntegrity = createNotesImportPlayIntegrity({
  playIntegrity: {
    isSupported: PlayIntegrity.isSupported,
    prepare: PlayIntegrity.prepare,
    requestToken: PlayIntegrity.requestToken,
    classifyError: PlayIntegrity.classifyError,
  },
  identity: {
    getOrCreateUuid: getOrCreateInstallId,
    getAccountId: getOrCreateAccountId,
  },
  crypto: {
    sha256Hex: (value) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
        encoding: Crypto.CryptoEncoding.HEX,
      }),
    randomUuid: Crypto.randomUUID,
  },
  transport: notesImportTransport,
  devBypass: notesImportDevBypass,
  baseUrl: notesImportBaseUrl,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})
