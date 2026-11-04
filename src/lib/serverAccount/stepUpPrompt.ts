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

/**
 * The web's step-up through its sheet (`StepUpSheet`): `requestStepUp` opens it
 * for an action and resolves with how it ended, once. The sheet runs
 * `webStepUp()`; analytics records each check's end. `requestContinue` asks for
 * the second tap before a passkey's create, once the step-up used the first
 * (Safari wants a fresh one).
 */

type StepUpRequest = {
  id: number
  kind: 'stepUp'
  action: SensitiveAction
  resolve: (result: StepUpResult) => void
}

/** How the second tap's sheet ended. */
export type ContinueAnswer = 'continue' | 'cancelled' | 'expired'

type ContinueRequest = {
  id: number
  kind: 'continue'
  action: SensitiveAction
  /** When the step-up stops counting (page clock): the sheet closes then. */
  until: number
  resolve: (answer: ContinueAnswer) => void
}

export type StepUpPromptRequest = StepUpRequest | ContinueRequest

export const useStepUpPrompt = create<{ request: StepUpPromptRequest | null }>(
  () => ({ request: null })
)

/** The page's monotonic clock: the step-up's window never reads the wall's. */
export const pageClock = () => globalThis.performance.now()

let nextId = 1
const passkeyListeners = new Set<(result: StepUpPasskey) => void>()

/** Calls `listener` after each passkey step-up; returns an unsubscribe. */
export function onPasskeyStepUp(listener: (result: StepUpPasskey) => void) {
  passkeyListeners.add(listener)
  return () => passkeyListeners.delete(listener)
}

/** What analytics records: how the check ended, never who or which passkey. */
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

/**
 * Opens the step-up sheet for `action`. One at a time: asking while it's open
 * is cancelled at once.
 */
export function requestStepUp(action: SensitiveAction): Promise<StepUpResult> {
  if (useStepUpPrompt.getState().request)
    return Promise.resolve({ status: 'cancelled' })
  return new Promise((resolve) =>
    useStepUpPrompt.setState({
      request: { id: nextId++, kind: 'stepUp', action, resolve },
    })
  )
}

/**
 * The second tap: opens the sheet's Continue for `action` until `until` (page
 * clock). Resolves `continue` straight from the tap, so what follows runs with
 * its user activation.
 */
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

/** The second tap's end, at once: no sheet closing first. */
export function finishContinue(id: number, answer: ContinueAnswer) {
  const { request } = useStepUpPrompt.getState()
  if (request?.kind !== 'continue' || request.id !== id) return
  useStepUpPrompt.setState({ request: null })
  request.resolve(answer)
}

/** The sheet's end: closes it and answers the request it was for. */
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

/** The step-up on this browser's session, made once. */
export function webStepUp(): WebStepUp {
  stepUp ??= createWebStepUp({
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    // No RP ID: the server picks the one the page's origin pairs with.
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
