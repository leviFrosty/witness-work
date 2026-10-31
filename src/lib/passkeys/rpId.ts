import { appVariant } from '@/lib/appVariant'

/**
 * The RP ID this phone build's passkeys belong to, as its associated domains
 * claim (`app.config.ts`). Beta uses production's (ADR 0038 §3).
 */
export const PASSKEY_RP_ID =
  appVariant === 'development'
    ? 'app-dev.witnesswork.app'
    : 'app.witnesswork.app'
