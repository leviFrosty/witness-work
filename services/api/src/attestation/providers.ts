import type { Environment } from '../types'
import { APP_ATTEST_PROTOCOL_VERSION } from '../appAttest/protocol'
import { playIntegrityConfig } from '../playIntegrity/config'
import { PLAY_INTEGRITY_PROTOCOL_VERSION } from '../playIntegrity/protocol'

export interface AttestationProviders {
  appAttest: {
    protocolVersions: readonly [1, typeof APP_ATTEST_PROTOCOL_VERSION]
  }
  /**
   * Present only when this worker can verify Android requests (ADR 0017).
   * Android keeps attested features closed while it is absent.
   */
  playIntegrity?: {
    protocolVersions: readonly [typeof PLAY_INTEGRITY_PROTOCOL_VERSION]
    cloudProjectNumber: string
  }
}

/** Which attestation providers this worker accepts, from config alone. */
export const attestationProviders = (
  env: Environment
): AttestationProviders => {
  const playIntegrity = playIntegrityConfig(env)
  return {
    appAttest: { protocolVersions: [1, APP_ATTEST_PROTOCOL_VERSION] },
    ...(playIntegrity
      ? {
          playIntegrity: {
            protocolVersions: [PLAY_INTEGRITY_PROTOCOL_VERSION],
            cloudProjectNumber: playIntegrity.cloudProjectNumber,
          },
        }
      : {}),
  }
}
