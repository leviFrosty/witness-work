import { Platform } from 'react-native'
import type {
  AppAttestSnapshot,
  AttestationDebugReport,
  AttestationRepairReport,
  NotesImportProtectedPost,
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

/** What each platform's authorizer provides. */
export interface DeviceAttestation {
  /** A Notes Import request, attested by its own challenge. */
  post<T>(request: NotesImportProtectedPost): Promise<T>
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
  AttestationRepairReport,
} from '@/lib/attestation/appAttest'
