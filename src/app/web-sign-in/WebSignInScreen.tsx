import { useEffect, useState } from 'react'
import type { BrowserApproval } from '@/lib/serverAccount/approvalSession'
import type { WebSignIn, WebSignInState } from '@/lib/serverAccount/webSignIn'
import PhoneSignIn from '@/app/web-sign-in/components/PhoneSignIn'
import RecoveryKeySignIn from '@/app/web-sign-in/components/RecoveryKeySignIn'
import SignInChoices from '@/app/web-sign-in/components/SignInChoices'
import { endedText } from '@/app/web-sign-in/signInCopy'
import type { SessionEndReason } from '@/lib/serverAccount/session'

type Page =
  | { name: 'choices' }
  | { name: 'phone'; approval: BrowserApproval }
  | {
      name: 'recovery'
    }

/**
 * The web's sign-in screen (ADR 0038 §6): the three ways, each on its own page,
 * over one sign-in flow (`webSignIn.ts`).
 */
export default function WebSignInScreen({
  flow,
  state,
  ended,
  keptData,
  onCreateAccount,
}: {
  flow: WebSignIn
  state: WebSignInState
  ended: SessionEndReason | null
  keptData: boolean
  onCreateAccount: () => void
}) {
  const [page, setPage] = useState<Page>({ name: 'choices' })

  // The phone's channels end with the page.
  useEffect(() => () => flow.stopPhone(), [flow])

  const back = () => {
    if (page.name === 'phone') flow.stopPhone()
    flow.clearProblem()
    setPage({ name: 'choices' })
  }

  const startPhone = () =>
    setPage({ name: 'phone', approval: flow.startPhone() })

  switch (page.name) {
    case 'phone':
      return (
        <PhoneSignIn
          approval={page.approval}
          state={state}
          onRetry={() => {
            flow.clearProblem()
            startPhone()
          }}
          onBack={back}
        />
      )
    case 'recovery':
      return (
        <RecoveryKeySignIn
          state={state}
          needsCheck={flow.recoveryNeedsCheck()}
          onSubmit={(key, token) => void flow.signInWithRecoveryKey(key, token)}
          onBack={back}
        />
      )
    default:
      return (
        <SignInChoices
          state={state}
          ended={endedText(ended)}
          keptData={keptData}
          onPasskey={() => void flow.signInWithPasskey()}
          onPhone={startPhone}
          onRecoveryKey={() => {
            flow.clearProblem()
            setPage({ name: 'recovery' })
          }}
          onCreateAccount={onCreateAccount}
        />
      )
  }
}
