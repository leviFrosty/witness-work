import { isDataProtectionRegion } from '@/lib/dataProtection'

/**
 * When a web session may be recorded (ADR 0043). Pure: the controller feeds it
 * the live answers, so a switch mid-session closes the gate on the next check.
 */

export type ReplayGateInput = {
  /** This session drew into the sample (`replaySampling.ts`). */
  sampled: boolean
  /** Usage analytics are on: the User's switch, hydrated and unlocked. */
  analyticsAllowed: boolean
  /** A production build. Other builds don't ingest usage, so they don't record. */
  production: boolean
  dataProtectionMode: boolean
  /** The visitor's country; null or undefined while unknown or still being read. */
  country: string | null | undefined
  /** The visitor turned on Session recordings in Settings. */
  optedIn: boolean
}

/**
 * Visitors in the regions Data Protection Mode defaults on in (the EU, the UK
 * and Switzerland) are recorded only after they opt in. So is anyone whose
 * country is unknown, or isn't read yet: an unknown visitor could be in one.
 */
export const replayOptInRequired = (
  country: string | null | undefined
): boolean => !country || isDataProtectionRegion(country)

export const replayAllowed = (input: ReplayGateInput): boolean =>
  input.sampled &&
  input.analyticsAllowed &&
  input.production &&
  !input.dataProtectionMode &&
  (!replayOptInRequired(input.country) || input.optedIn)
