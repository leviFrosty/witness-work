import { useEffect, useRef, useState } from 'react'
import type { BrowserApproval } from '@/lib/serverAccount/approvalSession'
import type { WebSignIn, WebSignInState } from '@/lib/serverAccount/webSignIn'
import type { WebSignUp, WebSignUpState } from '@/lib/serverAccount/webSignUp'
import PhoneSignIn from '@/app/web-sign-in/components/PhoneSignIn'
import RecoveryKeyGate from '@/app/web-sign-in/components/RecoveryKeyGate'
import RecoveryKeySignIn from '@/app/web-sign-in/components/RecoveryKeySignIn'
import SignInChoices from '@/app/web-sign-in/components/SignInChoices'
import SignUpPage from '@/app/web-sign-in/components/SignUpPage'
import { endedText, signInProblemText } from '@/app/web-sign-in/signInCopy'
import type { SessionEndReason } from '@/lib/serverAccount/session'

type Page =
  | { name: 'choices' }
  | { name: 'phone'; approval: BrowserApproval }
  | { name: 'recovery' }
  | { name: 'signUp' }

export default function WebSignInScreen({
  flow,
  state,
  signUp,
  signUpState,
  ended,
  changedAt = null,
  keptData,
  canSignUp,
  notice,
  onLeave,
}: {
  flow: WebSignIn
  state: WebSignInState
  signUp: WebSignUp
  signUpState: WebSignUpState
  ended: SessionEndReason | null

  changedAt?: number | null
  keptData: boolean

  canSignUp: boolean

  notice?: string

  onLeave?: () => void
}) {
  const [page, setPage] = useState<Page>(() =>
    signUpState.finishing ? { name: 'signUp' } : { name: 'choices' }
  )

  useEffect(() => () => flow.leave(), [flow])

  const back = () => {
    if (page.name === 'phone') flow.stopPhone()
    flow.clearProblem()
    signUp.clearProblem()
    setPage({ name: 'choices' })
  }

  const startPhone = () =>
    setPage({ name: 'phone', approval: flow.startPhone() })

  const held = signUpState.heldKey
  const triedKey = useRef<Uint8Array | null>(null)
  const unknownAccount =
    state.problem?.method === 'recovery' &&
    state.problem.failure === 'unknownAccount'
  useEffect(() => {
    const key = triedKey.current
    if (!held || !unknownAccount || !key) return
    triedKey.current = null
    void signUp.forgetUnknownAccount(key).then(() => {
      flow.clearProblem()
      setPage({ name: 'signUp' })
    })
  }, [held, unknownAccount, signUp, flow])

  if (held) {
    if (page.name === 'recovery')
      return (
        <RecoveryKeySignIn
          state={state}
          needsCheck={state.recoveryNeedsCheck}
          initialKey={held.recoveryKey}
          onSubmit={(key, token) => {
            triedKey.current = key
            void flow.signInWithRecoveryKey(key, token)
          }}
          onBack={() => {
            flow.clearProblem()
            setPage({ name: 'signUp' })
          }}
        />
      )
    return (
      <RecoveryKeyGate
        recoveryKey={held.recoveryKey}
        signInOnly={false}
        held={held.why}
        problem={
          state.problem?.method === 'passkey'
            ? signInProblemText(state.problem) || null
            : null
        }
        onPasskey={
          held.why === 'unreadable'
            ? () => void flow.signInWithPasskey()
            : undefined
        }
        onSaved={() => {
          flow.clearProblem()
          setPage({ name: 'recovery' })
        }}
      />
    )
  }

  if (signUpState.finishing) {
    return (
      <SignUpPage
        state={signUpState}
        onSubmit={(token) => void signUp.signUp(token)}
        onFinish={() => void signUp.finish()}
        onPasskeyGone={signUp.passkeyIsGone}
        onOnline={signUp.clearProblem}
      />
    )
  }

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
          needsCheck={state.recoveryNeedsCheck}
          onSubmit={(key, token) => void flow.signInWithRecoveryKey(key, token)}
          onBack={back}
        />
      )
    case 'signUp':
      return (
        <SignUpPage
          state={signUpState}
          onSubmit={(token) => void signUp.signUp(token)}
          onFinish={() => void signUp.finish()}
          onPasskeyGone={signUp.passkeyIsGone}
          onOnline={signUp.clearProblem}
          onBack={back}
        />
      )
    default:
      return (
        <SignInChoices
          state={state}
          ended={notice ?? endedText(ended, changedAt)}
          keptData={keptData}
          onPasskey={() => void flow.signInWithPasskey()}
          onPhone={startPhone}
          onRecoveryKey={() => {
            flow.clearProblem()
            setPage({ name: 'recovery' })
          }}
          onCreateAccount={
            canSignUp
              ? () => {
                  flow.clearProblem()
                  signUp.clearProblem()
                  setPage({ name: 'signUp' })
                }
              : undefined
          }
          onBack={onLeave}
        />
      )
  }
}
