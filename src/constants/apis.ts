const BASE_URL = 'https://ww-proxy.leviwilkerson.com'

// Notes Import may target a separate (dev/staging) worker so the App Attest
// dev-bypass path never touches production. Falls back to the prod proxy.
const NOTES_BASE_URL = process.env.EXPO_PUBLIC_NOTES_IMPORT_BASE_URL || BASE_URL

export default {
  geocode: `${BASE_URL}/geocode`,
  autocomplete: `${BASE_URL}/autocomplete`,
  // Unauthenticated worker health probe ({ status, versionId, deployedAt }) —
  // dev Tools screen only, for checking which worker build is live.
  notesImportHealth: `${NOTES_BASE_URL}/health`,
  notesImport: `${NOTES_BASE_URL}/notes-import`,
  notesImportStatus: `${NOTES_BASE_URL}/notes-import/status`,
  notesImportChallenge: `${NOTES_BASE_URL}/notes-import/challenge`,
  notesImportAttest: `${NOTES_BASE_URL}/notes-import/attest`,
  // Attested no-op — dev Tools diagnostics verify an assertion server-side
  // without spending credits or inference.
  notesImportVerify: `${NOTES_BASE_URL}/notes-import/verify`,
  // Streaming import: attested kickoff → SSE progress stream → result snapshot.
  notesImportKickoff: `${NOTES_BASE_URL}/notes-import/kickoff`,
  notesImportEvents: (importId: string) =>
    `${NOTES_BASE_URL}/notes-import/${importId}/events`,
  notesImportResult: (importId: string) =>
    `${NOTES_BASE_URL}/notes-import/${importId}/result`,
  notesImportCancel: (importId: string) =>
    `${NOTES_BASE_URL}/notes-import/${importId}/cancel`,
  notesImportDestroy: (importId: string) =>
    `${NOTES_BASE_URL}/notes-import/${importId}/destroy`,
}
