import type { AppVariant } from '@/lib/appVariant'

export type WebBilling = 'sandbox' | 'live'

export const webBillingFor = (variant: AppVariant): WebBilling =>
  variant === 'production' ? 'live' : 'sandbox'
