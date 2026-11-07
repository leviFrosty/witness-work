import { isDataProtectionRegion } from '@/lib/dataProtection'

export type ReplayGateInput = {
  sampled: boolean

  analyticsAllowed: boolean

  production: boolean
  dataProtectionMode: boolean

  country: string | null | undefined

  optedIn: boolean
}

export const replayOptInRequired = (
  country: string | null | undefined
): boolean => !country || isDataProtectionRegion(country)

export const replayAllowed = (input: ReplayGateInput): boolean =>
  input.sampled &&
  input.analyticsAllowed &&
  input.production &&
  !input.dataProtectionMode &&
  (!replayOptInRequired(input.country) || input.optedIn)
