import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'

interface ScribeConsentState {
  termsAcceptedAt: number | null
}

export const useScribeConsent = create<ScribeConsentState>()(
  persist<ScribeConsentState>(() => ({ termsAcceptedAt: null }), {
    name: 'scribe-consent',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
  })
)

export function scribeTermsPending(): boolean {
  return useScribeConsent.getState().termsAcceptedAt === null
}

export function acceptScribeTerms(at = Date.now()): void {
  useScribeConsent.setState({ termsAcceptedAt: at })
}
