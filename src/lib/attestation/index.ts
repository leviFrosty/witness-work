import { Platform } from 'react-native'
import type {
  AppAttestSnapshot,
  AttestationDebugReport,
  AttestationRepairReport,
  AttestationSupport,
  AttestedRequest,
} from '@/lib/attestation/appAttest'
import type { PlayIntegritySnapshot } from '@/lib/attestation/playIntegrity'
import { appAttestAuthorizer } from '@/lib/attestation/appAttestRuntime'
import { playIntegrityAuthorizer } from '@/lib/attestation/playIntegrityRuntime'

/**
 * Proof that this install is WitnessWork on a genuine device (ADR 0017): App
 * Attest on iOS, Play Integrity on Android. One instance per platform, so every
 * feature shares the install's App Attest key and its lifecycle.
 */

export type AttestationSnapshot = AppAttestSnapshot | PlayIntegritySnapshot

/**
 * What each platform's authorizer provides. Features attest once, through the
 * account session's `session/open` (ADR 0027), never per request.
 */
export interface DeviceAttestation {
  /**
   * An attested request through its own challenge route (account sessions'
   * `session/open`). Dev builds with the bypass token send that instead,
   * without a challenge.
   */
  assert<T>(request: AttestedRequest<T>): Promise<T>
  /** Whether this device can attest at all; see `AttestationSupport`. */
  checkSupport(): Promise<AttestationSupport>
  prepareRecovery(): Promise<void>
  getSnapshot(): AttestationSnapshot
  runDiagnostics(): Promise<AttestationDebugReport>
  runRepair(): Promise<AttestationRepairReport>
}

/** App Attest on iOS; Play Integrity on Android. */
export const deviceAttestation: DeviceAttestation =
  Platform.OS === 'android' ? playIntegrityAuthorizer : appAttestAuthorizer

export const getAttestationSnapshot = (): AttestationSnapshot =>
  deviceAttestation.getSnapshot()

export const runAttestationDiagnostics = (): Promise<AttestationDebugReport> =>
  deviceAttestation.runDiagnostics()

export const runAttestationRepair = (): Promise<AttestationRepairReport> =>
  deviceAttestation.runRepair()

export type {
  AttestationDebugReport,
  AttestationErrorCode,
  AttestationProof,
  AttestationPurpose,
  AttestationRepairReport,
  AttestationSupport,
  AttestedRequest,
} from '@/lib/attestation/appAttest'
export {
  AttestationError,
  AttestationHttpError,
} from '@/lib/attestation/appAttest'
export { toAttestationHttpError } from '@/lib/attestation/transport'
