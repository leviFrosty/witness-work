import { create } from 'zustand'
import { analytics } from '@/lib/analytics'
import { getPasskey } from '@/lib/passkeys'
import { bearerOptions } from '@/lib/serverAccount'
import { activityOptions } from '@/lib/serverAccount/accountDevices'
import { fetchSessionWindow } from '@/lib/serverAccount/activityClient'
import {
  finishPasskeyStepUp,
  startPasskeyStepUp,
} from '@/lib/serverAccount/passkeyClient'
import { webRuntime } from '@/lib/serverAccount/webRuntime'
import {
  createWebStepUp,
  type SensitiveAction,
  type StepUpPasskey,
  type StepUpResult,
  type WebStepUp,
} from '@/lib/serverAccount/stepUp'

type StepUpRequest = {
  id: number
  kind: 'stepUp'
  action: SensitiveAction
  resolve: (result: StepUpResult) => void
}

export type ContinueAnswer = 'continue' | 'cancelled' | 'expired'

type ContinueRequest = {
  id: number
  kind: 'continue'
  action: SensitiveAction

  until: number
  resolve: (answer: ContinueAnswer) => void
}

export type StepUpPromptRequest = StepUpRequest | ContinueRequest

export const useStepUpPrompt = create<{ request: StepUpPromptRequest | null }>(
  () => ({ request: null })
)

export const pageClock = () => globalThis.performance.now()

let nextId = 1
const passkeyListeners = new Set<(result: StepUpPasskey) => void>()

export function onPasskeyStepUp(listener: (result: StepUpPasskey) => void) {
  passkeyListeners.add(listener)
  return () => passkeyListeners.delete(listener)
}

const resultName = (result: StepUpResult) => {
  switch (result.status) {
    case 'confirmed':
      return result.via
    case 'noPasskey':
      return 'no_passkey'
    case 'failed':
      return result.reason
    default:
      return result.status
  }
}

export function requestStepUp(action: SensitiveAction): Promise<StepUpResult> {
  if (useStepUpPrompt.getState().request)
    return Promise.resolve({ status: 'cancelled' })
  return new Promise((resolve) =>
    useStepUpPrompt.setState({
      request: { id: nextId++, kind: 'stepUp', action, resolve },
    })
  )
}

export function requestContinue(
  action: SensitiveAction,
  until: number
): Promise<ContinueAnswer> {
  if (useStepUpPrompt.getState().request) return Promise.resolve('cancelled')
  if (pageClock() >= until) return Promise.resolve('expired')
  return new Promise((resolve) =>
    useStepUpPrompt.setState({
      request: { id: nextId++, kind: 'continue', action, until, resolve },
    })
  )
}

export function finishContinue(id: number, answer: ContinueAnswer) {
  const { request } = useStepUpPrompt.getState()
  if (request?.kind !== 'continue' || request.id !== id) return
  useStepUpPrompt.setState({ request: null })
  request.resolve(answer)
}

export function finishStepUp(id: number, result: StepUpResult) {
  const { request } = useStepUpPrompt.getState()
  if (request?.kind !== 'stepUp' || request.id !== id) return
  useStepUpPrompt.setState({ request: null })
  analytics.capture('web_step_up', {
    action: request.action,
    result: resultName(result),
  })
  if (result.status === 'confirmed' && result.via === 'passkey')
    for (const listener of passkeyListeners) listener(result)
  request.resolve(result)
}

async function requireKey(): Promise<Uint8Array> {
  const key = await webRuntime?.accountKey.peek()
  if (!key) throw new Error('No account key in this browser')
  return key
}

let stepUp: WebStepUp | null = null

export function webStepUp(): WebStepUp {
  stepUp ??= createWebStepUp({
    online: () => typeof navigator === 'undefined' || navigator.onLine,

    challenge: async () =>
      startPasskeyStepUp({}, bearerOptions(await requireKey())),
    get: getPasskey,
    assert: async (args) =>
      finishPasskeyStepUp(args, bearerOptions(await requireKey())),
    sessionWindow: async () =>
      fetchSessionWindow(activityOptions(await requireKey())()),
    elapsed: pageClock,
  })
  return stepUp
}
