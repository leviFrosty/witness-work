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

export type AttestationSnapshot = AppAttestSnapshot | PlayIntegritySnapshot

export interface DeviceAttestation {
  assert<T>(request: AttestedRequest<T>): Promise<T>

  checkSupport(): Promise<AttestationSupport>
  prepareRecovery(): Promise<void>
  getSnapshot(): AttestationSnapshot
  runDiagnostics(): Promise<AttestationDebugReport>
  runRepair(): Promise<AttestationRepairReport>
}

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
