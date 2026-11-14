import { forBuild } from '@/constants/buildVariant'

export const PRODUCTION_API_BASE_URL = 'https://api.witnesswork.app'

export const BETA_API_BASE_URL = 'https://api-beta.witnesswork.app'

export const LOCAL_API_BASE_URL = 'http://localhost:8787'

export const PRODUCTION_API_BASE_URLS: readonly string[] = [
  PRODUCTION_API_BASE_URL,
  'https://ww-proxy.leviwilkerson.com',
]
const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  forBuild({
    development: LOCAL_API_BASE_URL,
    beta: BETA_API_BASE_URL,
    production: PRODUCTION_API_BASE_URL,
  })

export default {
  geocode: `${BASE_URL}/geocode`,
  autocomplete: `${BASE_URL}/autocomplete`,

  placesSearch: `${BASE_URL}/places/v1/search`,

  mapkitTokens: `${BASE_URL}/maps/v1/mapkit-tokens`,

  appStoreRatings: `${BASE_URL}/app-store/ratings`,

  apiHealth: `${BASE_URL}/health`,

  scribeStatus: `${BASE_URL}/scribe/v1/status`,
  scribeUsage: `${BASE_URL}/scribe/v1/usage`,
  scribeStep: `${BASE_URL}/scribe/v1/step`,
  scribeTranscribe: `${BASE_URL}/scribe/v1/transcribe`,
  scribeTerritoryNotes: `${BASE_URL}/scribe/v1/territory-notes`,

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
