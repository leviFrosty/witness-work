import * as Crypto from 'expo-crypto'
import { getOrCreateAccountId } from '@/lib/account'
import { getOrCreateInstallId } from '@/lib/installId'
import { createPlayIntegrityAuthorizer } from '@/lib/attestation/playIntegrity'
import {
  attestationBaseUrl,
  attestationDevBypass,
  attestationTransport,
} from '@/lib/attestation/transport'
import * as PlayIntegrity from '../../../modules/play-integrity'

export const playIntegrityAuthorizer = createPlayIntegrityAuthorizer({
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
  transport: attestationTransport,
  devBypass: attestationDevBypass,
  baseUrl: attestationBaseUrl,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
})
