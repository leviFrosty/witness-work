import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

interface ScribeConsentState {
  termsAcceptedAt: number | null

  privacySeenAt: number | null
}

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
