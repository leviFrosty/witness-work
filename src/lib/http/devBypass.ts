// Dev builds talk to the dev worker, which accepts this token in place of a
// real Supporter entitlement or device attestation. Production builds never
// send it.
const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_API_DEV_BYPASS || ''

export const apiDevBypass = {
  enabled:
    typeof __DEV__ !== 'undefined' && __DEV__ && DEV_BYPASS_TOKEN.length > 0,
  token: DEV_BYPASS_TOKEN,
}

/** The bypass header for dev builds that have a token; empty otherwise. */
export const devBypassHeaders = (): Record<string, string> =>
  apiDevBypass.enabled ? { 'x-ww-dev-bypass': apiDevBypass.token } : {}
