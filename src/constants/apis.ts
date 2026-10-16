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
  // Attested no-op — dev Tools diagnostics verify an assertion server-side
  // without spending credits or inference.
  notesImportVerify: `${BASE_URL}/notes-import/verify`,
  // Streaming import: attested kickoff → SSE progress stream → result snapshot.
  notesImportKickoff: `${BASE_URL}/notes-import/kickoff`,
  // Import from Paper: attested, reads one page photo into text.
  notesImportTranscribe: `${BASE_URL}/notes-import/transcribe`,
  notesImportEvents: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/events`,
  notesImportResult: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/result`,
  notesImportDestroy: (importId: string) =>
    `${BASE_URL}/notes-import/${importId}/destroy`,
  // Supporter-only shortest order for today's stops; coordinates only.
  routePlanningOptimize: `${BASE_URL}/route-planning/optimize`,
  // Base for the Buddies relay's `/buddies/v1/*` ops (docs/buddies-protocol.md).
  buddies: BASE_URL,
  // Base for the server account's `/accounts/v1/*` ops (docs/accounts-protocol.md).
  accounts: BASE_URL,
  // Device attestation for the whole API (App Attest key setup, challenges).
  attestationChallenge: `${BASE_URL}/attestation/v1/challenge`,
  attestationRegister: `${BASE_URL}/attestation/v1/register`,
  // The app-wide minimum version (docs/accounts-protocol.md, "Updates").
  appConfig: `${BASE_URL}/app/v1/config`,
}
