import type { Environment } from './types'
import { timingSafeEqual } from './crypto'

/**
 * The development worker's shared `x-ww-dev-bypass` token
 * (`NOTES_IMPORT_DEV_BYPASS_TOKEN`), or null on production. Throws when
 * production has it set, or when `APP_ATTEST_ENVIRONMENT` isn't configured, so
 * a misconfigured deploy fails loudly instead of skipping attestation.
 */
export const resolveDevBypassToken = (
  env: Pick<Environment, 'APP_ATTEST_ENVIRONMENT' | 'NOTES_IMPORT_DEV_BYPASS_TOKEN'>
): string | null => {
  const token = env.NOTES_IMPORT_DEV_BYPASS_TOKEN?.trim() || null
  if (env.APP_ATTEST_ENVIRONMENT === 'production') {
    if (token) {
      throw new Error(
        'NOTES_IMPORT_DEV_BYPASS_TOKEN cannot be set in production'
      )
    }
    return null
  }
  if (env.APP_ATTEST_ENVIRONMENT === 'development') return token
  throw new Error('APP_ATTEST_ENVIRONMENT must be explicitly configured')
}

/** Whether `header` carries the dev bypass token (constant-time compare). */
export const matchesDevBypass = (
  token: string | null,
  header: string | undefined
): boolean => token != null && timingSafeEqual(header ?? '', token)
