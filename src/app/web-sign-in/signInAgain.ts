import { create } from 'zustand'
import { analytics } from '@/lib/analytics'
import type { SensitiveAction } from '@/lib/serverAccount/stepUp'

export const useSignInAgain = create<{ open: boolean }>(() => ({
  open: false,
}))

export function startSignInAgain(action: SensitiveAction) {
  analytics.capture('web_sign_in_again', { action })
  useSignInAgain.setState({ open: true })
}

export const endSignInAgain = () => useSignInAgain.setState({ open: false })
