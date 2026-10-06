import { Platform } from 'react-native'
import type {
  NotesImportAuthDebugReport,
  NotesImportAuthRepairReport,
  NotesImportAuthSnapshot as AppAttestAuthSnapshot,
  NotesImportProtectedPost,
} from '@/features/notes-import/lib/notesImportAppAttest'
import type { NotesImportPlayIntegritySnapshot } from '@/features/notes-import/lib/notesImportPlayIntegrity'
import { notesImportAppAttest } from '@/features/notes-import/lib/notesImportAppAttestRuntime'
import { notesImportPlayIntegrity } from '@/features/notes-import/lib/notesImportPlayIntegrityRuntime'

export type NotesImportAuthSnapshot =
  | AppAttestAuthSnapshot
  | NotesImportPlayIntegritySnapshot

/** What each platform's Notes Import authorizer provides (ADR 0017). */
export interface NotesImportAuthorizer {
  post<T>(request: NotesImportProtectedPost): Promise<T>
  prepareRecovery(): Promise<void>
  getSnapshot(): NotesImportAuthSnapshot
  runDiagnostics(): Promise<NotesImportAuthDebugReport>
  runRepair(): Promise<NotesImportAuthRepairReport>
}

/** App Attest on iOS; Play Integrity on Android. */
export const notesImportAuth: NotesImportAuthorizer =
  Platform.OS === 'android' ? notesImportPlayIntegrity : notesImportAppAttest

export const getNotesImportAuthSnapshot = (): NotesImportAuthSnapshot =>
  notesImportAuth.getSnapshot()

export const runNotesImportAuthDiagnostics =
  (): Promise<NotesImportAuthDebugReport> => notesImportAuth.runDiagnostics()

export const runNotesImportAuthRepair =
  (): Promise<NotesImportAuthRepairReport> => notesImportAuth.runRepair()

export type {
  NotesImportAuthDebugReport,
  NotesImportAuthRepairReport,
} from '@/features/notes-import/lib/notesImportAppAttest'
