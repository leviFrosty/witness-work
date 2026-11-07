export const IS_DEVELOPMENT_BUILD =
  process.env.EXPO_PUBLIC_APP_VARIANT === 'development'

export const forBuild = <T>(values: { development: T; release: T }): T =>
  IS_DEVELOPMENT_BUILD ? values.development : values.release
