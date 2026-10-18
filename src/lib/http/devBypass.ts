// Dev builds talk to the dev worker, which accepts this token in place of
// device attestation when a session opens. Production builds never send it.
const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_API_DEV_BYPASS || ''

export const apiDevBypass = {
  enabled:
    typeof __DEV__ !== 'undefined' && __DEV__ && DEV_BYPASS_TOKEN.length > 0,
  token: DEV_BYPASS_TOKEN,
}
