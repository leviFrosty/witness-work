const DEV_BYPASS_TOKEN = process.env.EXPO_PUBLIC_API_DEV_BYPASS || ''

export const apiDevBypass = {
  enabled:
    typeof __DEV__ !== 'undefined' && __DEV__ && DEV_BYPASS_TOKEN.length > 0,
  token: DEV_BYPASS_TOKEN,
}
