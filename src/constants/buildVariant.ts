import { BETA_BUILD_ENVIRONMENT } from '@/constants/betaBuildEnvironment'

export type BuildEnvironment = 'development' | 'beta' | 'production'

const VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT

export const IS_DEVELOPMENT_BUILD = VARIANT === 'development'

const RELEASE_ENVIRONMENT: BuildEnvironment =
  VARIANT === 'beta' ? BETA_BUILD_ENVIRONMENT : 'production'

export const BUILD_ENVIRONMENT: BuildEnvironment = IS_DEVELOPMENT_BUILD
  ? 'development'
  : RELEASE_ENVIRONMENT

export const forBuild = <T>(values: Record<BuildEnvironment, T>): T =>
  values[BUILD_ENVIRONMENT]
