const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ww-proxy.leviwilkerson.com'

export default {
  geocode: `${BASE_URL}/geocode`,
  autocomplete: `${BASE_URL}/autocomplete`,

  appStoreRatings: `${BASE_URL}/app-store/ratings`,

  apiHealth: `${BASE_URL}/health`,

  scribeStatus: `${BASE_URL}/scribe/v1/status`,
  scribeUsage: `${BASE_URL}/scribe/v1/usage`,
  scribeStep: `${BASE_URL}/scribe/v1/step`,
  scribeTranscribe: `${BASE_URL}/scribe/v1/transcribe`,

  routePlanningOptimize: `${BASE_URL}/route-planning/optimize`,
  routePlanningDirections: `${BASE_URL}/route-planning/directions`,

  buddies: BASE_URL,

  accounts: BASE_URL,

  spaces: BASE_URL,

  attestationStatus: `${BASE_URL}/attestation/v1/status`,
  attestationChallenge: `${BASE_URL}/attestation/v1/challenge`,
  attestationRegister: `${BASE_URL}/attestation/v1/register`,

  attestationVerify: `${BASE_URL}/attestation/v1/verify`,

  appConfig: `${BASE_URL}/app/v1/config`,
}
