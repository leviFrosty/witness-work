/**
 * Every `purpose` an App Attest v2 or Play Integrity assertion may name. The
 * purpose is signed into the assertion's client data (and the Play Integrity
 * request hash), so an assertion made for one protected request can't be
 * spent on another. Each consuming route checks that the purpose is its own.
 *
 * A feature that wants attested requests adds its purposes here and passes
 * one to `requireAttestation` (src/attestation/http.ts). Shipped values are
 * signed by installed apps: never rename one. Retire a purpose by removing
 * the route that consumes it.
 */
export const ATTESTATION_PURPOSES = [
  // POST /attestation/v1/verify: the no-payload probe.
  'attestation-verify',
  // Notes Import (src/notesImport/route.ts).
  'notes-import-kickoff',
  'notes-import-transcribe',
  // The verify probe's purpose from when it lived at /notes-import/verify;
  // the deployed apps still sign it, so verify accepts it on both paths.
  'notes-import-verify',
  // Opening an account session, POST /accounts/v1/sessions
  // (src/accounts/attestation.ts): both hashes cover the account key.
  'account-session',
] as const

export type AttestationPurpose = (typeof ATTESTATION_PURPOSES)[number]

export const ATTESTATION_VERIFY_PURPOSE = 'attestation-verify'
export const NOTES_IMPORT_KICKOFF_PURPOSE = 'notes-import-kickoff'
export const NOTES_IMPORT_TRANSCRIBE_PURPOSE = 'notes-import-transcribe'
export const NOTES_IMPORT_VERIFY_PURPOSE = 'notes-import-verify'
export const ACCOUNT_SESSION_PURPOSE = 'account-session'

const PURPOSES: ReadonlySet<string> = new Set(ATTESTATION_PURPOSES)

export const isAttestationPurpose = (
  value: string
): value is AttestationPurpose => PURPOSES.has(value)

/** The purposes `POST /attestation/v1/verify` (and its old path) accepts. */
export const isVerifyPurpose = (
  value: unknown
): value is
  | typeof ATTESTATION_VERIFY_PURPOSE
  | typeof NOTES_IMPORT_VERIFY_PURPOSE =>
  value === ATTESTATION_VERIFY_PURPOSE || value === NOTES_IMPORT_VERIFY_PURPOSE
