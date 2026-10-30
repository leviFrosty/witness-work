/**
 * Whether this is a development build. `app.config.ts` inlines
 * `EXPO_PUBLIC_APP_VARIANT` into native and OTA bundles alike; unset (as in
 * tests) counts as production.
 */
export const IS_DEVELOPMENT_BUILD =
  process.env.EXPO_PUBLIC_APP_VARIANT === 'development'

/** Development builds' value, or the one beta and production use. */
export const forBuild = <T>(values: { development: T; release: T }): T =>
  IS_DEVELOPMENT_BUILD ? values.development : values.release
