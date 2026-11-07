import { appVariant } from '@/lib/appVariant'

export const PASSKEY_RP_ID =
  appVariant === 'development'
    ? 'app-dev.witnesswork.app'
    : 'app.witnesswork.app'
