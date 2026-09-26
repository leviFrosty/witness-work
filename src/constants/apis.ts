// Every endpoint lives on ww-api. Override the base URL to target a dev/staging
// worker (so the App Attest dev-bypass never touches production).
const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ww-proxy.leviwilkerson.com'

export default {
  geocode: `${BASE_URL}/geocode`,
  autocomplete: `${BASE_URL}/autocomplete`,
  // Paywall social proof; edge-cached by the worker, persisted 7 days here.
  appStoreRatings: `${BASE_URL}/app-store/ratings`,
  // Unauthenticated worker health probe ({ status, versionId, deployedAt }) —
  // dev Tools screen only, for checking which worker build is live.
  notesImportHealth: `${BASE_URL}/health`,
  notesImport: `${BASE_URL}/notes-import`,
  notesImportStatus: `${BASE_URL}/notes-import/status`,
  notesImportChallenge: `${BASE_URL}/notes-import/challenge`,
  notesImportAttest: `${BASE_URL}/notes-import/attest`,
  // Attested no-op — dev Tools diagnostics verify an assertion server-side
  // without spending credits or inference.
  notesImportVerify: `${BASE_URL}/notes-import/verify`,
  // Streaming import: attested kickoff → SSE progress stream → result snapshot.
  notesImportKickoff: `${BASE_URL}/notes-import/kickoff`,
  notesImportEvents: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/events`,
  notesImportResult: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/result`,
  notesImportCancel: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/cancel`,
  notesImportDestroy: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/destroy`,
}
