import type { PropsWithChildren } from 'react'

/**
 * Phones sign in from onboarding and Settings; only the web's app waits for a
 * sign-in (`WebSignInGate.web.tsx`).
 */
export default function WebSignInGate({ children }: PropsWithChildren) {
  return children
}
