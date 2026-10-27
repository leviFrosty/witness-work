import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

interface ScribeConsentState {
  /** When this device agreed to the Terms of Use for Scribe AI. */
  termsAcceptedAt: number | null
  /** When this device finished the first-open Zero Data Retention step. */
  privacySeenAt: number | null
}

/**
 * What this device agreed to before using Scribe AI (device-only MMKV, never
 * synced or backed up): another device, or this one after a reinstall, asks
 * again.
 */
export const useScribeConsent = create<ScribeConsentState>()(
  persist<ScribeConsentState>(
    () => ({ termsAcceptedAt: null, privacySeenAt: null }),
    {
      name: 'scribe-consent',
      version: 1,
      migrate: keepPersistedState,
      storage: createJSONStorage(() => MmkvStorage),
    }
  )
)

/** The first-open steps this device still has to see. */
export function pendingScribeConsent(): { terms: boolean; privacy: boolean } {
  const { termsAcceptedAt, privacySeenAt } = useScribeConsent.getState()
  return { terms: termsAcceptedAt === null, privacy: privacySeenAt === null }
}

export function scribeConsentPending(): boolean {
  const pending = pendingScribeConsent()
  return pending.terms || pending.privacy
}

export function acceptScribeTerms(at = Date.now()): void {
  useScribeConsent.setState({ termsAcceptedAt: at })
}

export function markScribePrivacySeen(at = Date.now()): void {
  useScribeConsent.setState({ privacySeenAt: at })
}
