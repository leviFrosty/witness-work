// Every endpoint lives on ww-api. Override the base URL to target a dev/staging
// worker (so the App Attest dev-bypass never touches production).
const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ww-proxy.leviwilkerson.com'

export default {
  geocode: `${BASE_URL}/geocode`,
  autocomplete: `${BASE_URL}/autocomplete`,
  // Paywall social proof; edge-cached by the worker, persisted 7 days here.
  appStoreRatings: `${BASE_URL}/app-store/ratings`,
  // Unauthenticated worker health probe ({ status, versionId, deployedAt }):
  // the sync clock's server time, and dev Tools' check of which build is live.
  apiHealth: `${BASE_URL}/health`,
  // Scribe AI (docs/scribe-ai-protocol.md). Status is public; the rest go
  // through the account session.
  scribeStatus: `${BASE_URL}/scribe/v1/status`,
  scribeUsage: `${BASE_URL}/scribe/v1/usage`,
  scribeStep: `${BASE_URL}/scribe/v1/step`,
  scribeTranscribe: `${BASE_URL}/scribe/v1/transcribe`,
  // Supporter-only shortest order for today's stops; coordinates only.
  routePlanningOptimize: `${BASE_URL}/route-planning/optimize`,
  // Base for the Buddies relay's `/buddies/v1/*` ops (docs/buddies-protocol.md).
  buddies: BASE_URL,
  // Base for the server account's `/accounts/v1/*` ops (docs/accounts-protocol.md).
  accounts: BASE_URL,
  // Device attestation for the whole API (App Attest key setup, challenges).
  // Status is the App Attest and Play Integrity capabilities, no auth.
  attestationStatus: `${BASE_URL}/attestation/v1/status`,
  attestationChallenge: `${BASE_URL}/attestation/v1/challenge`,
  attestationRegister: `${BASE_URL}/attestation/v1/register`,
  // Attested no-op the dev Tools diagnostics use: verifies an assertion
  // server-side without spending anything.
  attestationVerify: `${BASE_URL}/attestation/v1/verify`,
  // The app-wide minimum version (docs/accounts-protocol.md, "Updates").
  appConfig: `${BASE_URL}/app/v1/config`,
}
