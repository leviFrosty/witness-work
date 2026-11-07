import { encodeRecoveryKey } from '@/lib/accountKey/recoveryKey'
import { fromB64u, sameBytes, toB64u } from '@/lib/bytes'
import { PasskeyError, type PasskeyErrorCode } from '@/lib/passkeys/errors'
import type {
  CreatedPasskey,
  PasskeyAssertion,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@/lib/passkeys/types'
import { HttpError } from '@/lib/http/request'
import { deriveAccountSigningKey } from '@/lib/serverAccount/keys'
import {
  type PasskeyChallenge,
  type PasskeyFailure,
  passkeyFailureFor,
  type PasskeyResponseJSON,
  type PasskeySignIn,
} from '@/lib/serverAccount/passkeyClient'
import {
  PRF_OUTPUT_BYTES,
  unlockRequest,
} from '@/lib/serverAccount/passkeyFlow'
import {
  newPasskeyWrapId,
  passkeyName,
  wrapAccountKey,
} from '@/lib/serverAccount/passkeys'
import type { OpenedSession } from '@/lib/serverAccount/sessionClient'
import {
  type WebAccount,
  type WebSignIn as WebAccountSignIn,
  WebSignInError,
} from '@/lib/serverAccount/webAccount'

export type WebSignUpStage = 'key' | 'sent' | 'created'

export type WebSignUpMark = {
  accountId: string
  stage: WebSignUpStage

  accountPub: string

  credentialId?: string

  rpId?: string

  signInOnly?: boolean

  passkeyName?: string
}

export class WebSignUpMarkUnreadable extends Error {
  constructor(options?: { cause?: unknown }) {
    super('web sign-up: the mark is unreadable', options)
    this.name = 'WebSignUpMarkUnreadable'
  }
}

export type WebSignUpMarkStore = {
  read: () => Promise<WebSignUpMark | null>
  write: (mark: WebSignUpMark | null) => Promise<void>
}

export const WEB_SIGN_UP_MARK_KEY = 'web-signup'

export const WEB_SIGN_UP_LOCK = 'ww-signup'

const STAGES: readonly WebSignUpStage[] = ['key', 'sent', 'created']

type PlainKv = {
  get: <T>(key: string) => Promise<T | null | undefined>
  set: (key: string, value: unknown) => Promise<void>
  delete: (key: string) => Promise<void>
}

export function createWebSignUpMarkStore(kv: PlainKv): WebSignUpMarkStore {
  return {
    read: async () => {
      let value: WebSignUpMark | null | undefined
      try {
        value = await kv.get<WebSignUpMark>(WEB_SIGN_UP_MARK_KEY)
      } catch (cause) {
        throw new WebSignUpMarkUnreadable({ cause })
      }
      if (value === undefined || value === null) return null
      if (
        typeof value !== 'object' ||
        typeof value.accountId !== 'string' ||
        typeof value.accountPub !== 'string' ||
        !STAGES.includes(value.stage)
      )
        throw new WebSignUpMarkUnreadable()
      return value
    },
    write: (value) =>
      value === null
        ? kv.delete(WEB_SIGN_UP_MARK_KEY)
        : kv.set(WEB_SIGN_UP_MARK_KEY, value),
  }
}

export function createSignUpKeyGuard({
  mark,
  readStoredKey,
  lockFree,
}: {
  mark: WebSignUpMarkStore
  readStoredKey: () => Promise<Uint8Array | null>

  lockFree: () => Promise<boolean>
}) {
  return async (
    accountKey: Uint8Array
  ): Promise<'signUpPending' | 'keyHeld' | null> => {
    const accountPub = publicKeyOf(accountKey)
    let read: WebSignUpMark | null
    try {
      read = await mark.read()
    } catch (error) {
      if (!(error instanceof WebSignUpMarkUnreadable)) throw error
      const stored = await readStoredKey()
      return stored !== null && publicKeyOf(stored) !== accountPub
        ? 'keyHeld'
        : null
    }
    if (read === null || read.accountPub === accountPub) return null
    if (read.stage !== 'key') return 'signUpPending'

    return (await lockFree()) ? null : 'signUpPending'
  }
}

export type WebSignUpFailure =
  | 'cancelled'
  | 'passkeyNotSaved'
  | 'notSupported'
  | 'passkeyFailed'
  | 'turnstileFailed'
  | 'rateLimited'
  | 'paused'
  | 'unavailable'
  | 'offline'
  | 'unreachable'
  | 'updateRequired'
  | 'storage'
  | 'otherTab'
  | 'wrongPasskey'
  | 'pickPasskey'
  | 'notCreated'
  | 'failed'

export type WebSignUpStep = 'options' | 'key' | 'create' | 'signup' | 'finish'

export type WebSignUpProblem = {
  failure: Exclude<WebSignUpFailure, 'cancelled'>
  retryAfterMs: number | null

  passkeyName?: string
}

export type WebSignUpState = {
  ready: boolean
  busy: boolean
  problem: WebSignUpProblem | null

  finishing: boolean

  recoveryKey: { signInOnly: boolean } | null

  finishStage: 'sent' | 'created' | null

  heldKey: {
    recoveryKey: string
    why: 'passkeyGone' | 'mayExist' | 'unreadable'
  } | null
}

export type WebSignUpFailureReason =
  | WebSignUpFailure
  | PasskeyErrorCode
  | PasskeyFailure
  | `${PasskeyFailure}:${string}`
  | 'options'
  | 'mismatch'
  | 'keyPresent'
  | 'keptData'
  | 'markUnreadable'
  | 'keyMissing'

export type WebSignUpEvent =
  | { type: 'started' }
  | {
      type: 'completed'

      prf: boolean

      finished: boolean
    }
  | { type: 'failed'; step: WebSignUpStep; reason: WebSignUpFailureReason }
  | { type: 'recoveryKeySaved' }

export type WebSignUpRequest = {
  challengeToken: string
  response: PasskeyResponseJSON
  wrapId?: string
  wrap?: string
  label?: string
  device?: string
  appVersion?: string
}

export type WebSignUpLock = (run: () => Promise<void>) => Promise<boolean>

export type WebSignUpDeps = {
  account: Pick<
    WebAccount,
    'adoptSignupSession' | 'openWebSessionWithTicket' | 'state'
  >

  owner: { read: () => Promise<string | null> }
  accountKey: {
    create: () => Promise<Uint8Array>

    discard: (made: Uint8Array) => Promise<void>

    readStored: () => Promise<Uint8Array | null>
  }
  server: {
    options: (
      turnstileToken: string
    ) => Promise<PasskeyChallenge & { accountId: string; userHandle: string }>

    signup: (
      accountKey: Uint8Array,
      request: WebSignUpRequest
    ) => Promise<OpenedSession & { credentialId: string }>

    signInChallenge: () => Promise<PasskeyChallenge>

    assert: (args: {
      challengeToken: string
      response: PasskeyResponseJSON
    }) => Promise<PasskeySignIn>

    closeOpened: (accessToken: string) => Promise<void>
  }

  ceremonies: {
    create: (
      options: PublicKeyCredentialCreationOptionsJSON
    ) => Promise<CreatedPasskey>
    get: (
      options: PublicKeyCredentialRequestOptionsJSON
    ) => Promise<PasskeyAssertion>
  }

  signalUnknownPasskey?: (rpId: string, credentialId: string) => void

  rpId: () => string

  label: (accountKey: Uint8Array) => string | undefined
  appVersion?: () => string | undefined
  mark: WebSignUpMarkStore
  lock: WebSignUpLock

  isOnline?: () => boolean
  randomBytes: (length: number) => Uint8Array
  onEvent?: (event: WebSignUpEvent) => void
}

const INITIAL: WebSignUpState = {
  ready: false,
  busy: false,
  problem: null,
  finishing: false,
  recoveryKey: null,
  finishStage: null,
  heldKey: null,
}

const ALGORITHMS = new Set([-8, -7, -257])
const USER_HANDLE_BYTES = 32

const CHALLENGE = /^[A-Za-z0-9_-]{22,}$/

const isUserHandle = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const bytes = fromB64u(value)
    return bytes.length === USER_HANDLE_BYTES && toB64u(bytes) === value
  } catch {
    return false
  }
}

export function signUpCreationOptions(
  answer: PasskeyChallenge & { userHandle: string },
  rpId: string
):
  | { ok: true; options: PublicKeyCredentialCreationOptionsJSON }
  | { ok: false } {
  const options = answer.options as Record<string, unknown>
  const user = (options.user ?? {}) as Record<string, unknown>
  const rp = (options.rp ?? {}) as Record<string, unknown>
  const { userHandle } = answer
  const name = isUserHandle(userHandle) ? passkeyName(userHandle) : null
  const params = Array.isArray(options.pubKeyCredParams)
    ? (options.pubKeyCredParams as Record<string, unknown>[]).filter(
        (param) =>
          param?.type === 'public-key' && ALGORITHMS.has(param.alg as number)
      )
    : []
  if (
    !name ||
    user.id !== userHandle ||
    user.name !== name ||
    user.displayName !== name ||
    rp.id !== rpId ||
    typeof options.challenge !== 'string' ||
    !CHALLENGE.test(options.challenge) ||
    params.length === 0
  )
    return { ok: false }
  return {
    ok: true,
    options: {
      challenge: options.challenge,
      rp: { id: rpId, name: 'WitnessWork' },
      user: { id: userHandle, name, displayName: name },
      pubKeyCredParams: params.map((param) => ({
        type: 'public-key',
        alg: param.alg as number,
      })),
      timeout: 300_000,
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required',
      },
      attestation: 'none',
    },
  }
}

export function webSignUpFailureFor(
  error: unknown,
  online = true
): {
  failure: WebSignUpFailure
  retryAfterMs: number | null

  reason: WebSignUpFailureReason
} {
  const plain = (
    failure: WebSignUpFailure,
    reason: WebSignUpFailureReason = failure
  ) => ({ failure, retryAfterMs: null, reason })
  if (error instanceof PasskeyError)
    switch (error.code) {
      case 'cancelled':
      case 'timeout':
        return plain('cancelled', error.code)
      case 'not_supported':
        return plain('notSupported', error.code)
      default:
        return plain('passkeyFailed', error.code)
    }
  if (error instanceof WebSignInError)
    return plain(error.reason === 'storage' ? 'storage' : 'failed')
  if (error instanceof HttpError && error.serverCode === 'disabled')
    return plain('paused')
  const { failure, reason, retryAfterMs } = passkeyFailureFor(error)
  const result = (mapped: WebSignUpFailure) => ({
    failure: mapped,
    retryAfterMs,
    reason: reason ? (`${failure}:${reason}` as const) : failure,
  })
  if (error instanceof HttpError && error.serverCode === 'unavailable')
    return { ...result('unavailable'), reason: 'unavailable' }
  switch (failure) {
    case 'offline':
      return online
        ? { ...result('unreachable'), reason: 'unreachable' }
        : result('offline')
    case 'updateRequired':
    case 'rateLimited':
    case 'turnstileFailed':
    case 'passkeyFailed':
      return result(failure)
    default:
      return result('failed')
  }
}

function lostAnswer(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  if (error.serverCode === 'conflict' || error.serverCode === 'replay')
    return true
  const { failure, reason } = passkeyFailureFor(error)
  return failure === 'passkeyFailed' && reason === 'challenge'
}

const refused = (error: unknown) =>
  error instanceof HttpError &&
  error.status !== null &&
  ((error.status >= 400 && error.status < 500) ||
    (error.status === 503 && error.serverCode !== null))

function unknownPasskey(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  const { failure, reason } = passkeyFailureFor(error)
  return failure === 'passkeyFailed' && reason === 'unknown_credential'
}

function otherUserPasskey(error: unknown): boolean {
  if (!(error instanceof HttpError)) return false
  const { failure, reason } = passkeyFailureFor(error)
  return failure === 'passkeyFailed' && reason === 'user_handle'
}

const publicKeyOf = (accountKey: Uint8Array) =>
  deriveAccountSigningKey(accountKey).publicKey

type Attempt = {
  accountId: string
  accountKey: Uint8Array
  accountPub: string
  credentialId: string
  rpId: string
  signInOnly: boolean
  passkeyName: string

  request: WebSignUpRequest | null
}

class CantStart extends Error {
  constructor(
    readonly reason: 'keyPresent' | 'keptData' | 'markUnreadable',

    readonly stored?: Uint8Array
  ) {
    super(`web sign-up: ${reason}`)
  }
}

export function createWebSignUp(deps: WebSignUpDeps) {
  let state: WebSignUpState = INITIAL
  const listeners = new Set<() => void>()
  let attempt: Attempt | null = null

  let unanswered = false
  const online = () => deps.isOnline?.() ?? true

  const set = (next: Partial<WebSignUpState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  const emit = (event: WebSignUpEvent) => {
    try {
      deps.onEvent?.(event)
    } catch {}
  }

  function failed(
    step: WebSignUpStep,
    error: unknown,
    next: Partial<WebSignUpState> = {}
  ) {
    const { failure, retryAfterMs, reason } = webSignUpFailureFor(
      error,
      online()
    )
    emit({ type: 'failed', step, reason })

    const shown: WebSignUpFailure =
      failure === 'cancelled' && step === 'create' ? 'passkeyNotSaved' : failure
    set({
      ...next,
      busy: false,
      problem: shown === 'cancelled' ? null : { failure: shown, retryAfterMs },
    })
  }

  function refuse(
    step: WebSignUpStep,
    failure: WebSignUpProblem['failure'],
    reason: WebSignUpFailureReason,
    next: Partial<WebSignUpState> = {}
  ) {
    emit({ type: 'failed', step, reason })
    set({ ...next, busy: false, problem: { failure, retryAfterMs: null } })
  }

  const held = (
    accountKey: Uint8Array,
    why: NonNullable<WebSignUpState['heldKey']>['why']
  ): WebSignUpState['heldKey'] => ({
    recoveryKey: encodeRecoveryKey(accountKey),
    why,
  })

  const finishedWith = (): Partial<WebSignUpState> => ({
    finishing: false,
    finishStage: null,
    heldKey: null,
  })

  const signalUnknown = (passkey: { rpId?: string; credentialId?: string }) => {
    if (!passkey.rpId || !passkey.credentialId) return
    try {
      deps.signalUnknownPasskey?.(passkey.rpId, passkey.credentialId)
    } catch {}
  }

  async function forgetAttempt(
    accountKey: Uint8Array | null,
    passkey: { rpId?: string; credentialId?: string } = {}
  ) {
    attempt = null
    unanswered = false
    if (accountKey) await deps.accountKey.discard(accountKey)
    await deps.mark.write(null)
    signalUnknown(passkey)
  }

  async function created(
    done: Pick<Attempt, 'accountId' | 'accountPub' | 'signInOnly'> & {
      credentialId?: string
      rpId?: string
      passkeyName?: string
    },
    open: () => Promise<WebAccountSignIn>,
    finished: boolean
  ): Promise<void> {
    const mark: WebSignUpMark = {
      accountId: done.accountId,
      accountPub: done.accountPub,
      stage: 'created',
      ...(done.credentialId && { credentialId: done.credentialId }),
      ...(done.rpId && { rpId: done.rpId }),
      signInOnly: done.signInOnly,
      ...(done.passkeyName && { passkeyName: done.passkeyName }),
    }

    await deps.mark.write(mark).catch(() => undefined)
    let reload: boolean
    try {
      ;({ reload } = await open())
    } catch (error) {
      if (attempt) attempt.request = null
      return failed('finish', error, {
        finishing: true,
        finishStage: 'created',
      })
    }
    attempt = null
    unanswered = false
    emit({ type: 'completed', prf: !done.signInOnly, finished })
    if (reload) {
      await deps.mark.write(mark).catch(() => undefined)
      return
    }
    set({
      ...finishedWith(),
      busy: false,
      problem: null,
      recoveryKey: { signInOnly: done.signInOnly },
    })
  }

  async function confirmPrf(
    credentialId: string,
    rpId: string
  ): Promise<Uint8Array | null> {
    let assertion: PasskeyAssertion
    try {
      assertion = await deps.ceremonies.get(
        unlockRequest(deps, credentialId, rpId)
      )
    } catch {
      return null
    }
    if (
      assertion.response.rawId !== credentialId ||
      assertion.prf?.length !== PRF_OUTPUT_BYTES
    ) {
      assertion.prf?.fill(0)
      return null
    }
    return assertion.prf
  }

  async function submit(current: Attempt, request: WebSignUpRequest) {
    let opened: OpenedSession & { credentialId: string }
    try {
      opened = await deps.server.signup(current.accountKey, request)
    } catch (error) {
      if (lostAnswer(error)) {
        current.request = null
        return finishWithPasskey()
      }
      if (!unanswered && refused(error)) {
        await forgetAttempt(current.accountKey, current).catch(() => undefined)
        return failed('signup', error, finishedWith())
      }
      unanswered = true
      return failed('signup', error, { finishing: true, finishStage: 'sent' })
    }
    if (
      opened.accountId !== current.accountId ||
      opened.credentialId !== current.credentialId
    ) {
      void deps.server.closeOpened(opened.accessToken).catch(() => undefined)
      current.request = null
      return refuse('signup', 'failed', 'mismatch', {
        finishing: true,
        finishStage: 'sent',
      })
    }
    await created(
      current,
      () => deps.account.adoptSignupSession(current.accountKey, opened),
      false
    )
  }

  async function finishWithPasskey(): Promise<void> {
    let mark: WebSignUpMark | null
    let accountKey: Uint8Array | null
    try {
      mark = await deps.mark.read()
      accountKey = attempt?.accountKey ?? (await deps.accountKey.readStored())
    } catch (error) {
      return failed('finish', error, { finishing: true })
    }
    const accountPub = accountKey ? publicKeyOf(accountKey) : null
    if (
      !mark ||
      mark.stage === 'key' ||
      !accountKey ||
      accountPub !== mark.accountPub
    ) {
      attempt = null

      if (
        mark?.stage === 'key' &&
        accountKey &&
        accountPub === mark.accountPub
      ) {
        await forgetAttempt(accountKey, mark).catch(() => undefined)
        return refuse('finish', 'notCreated', 'notCreated', finishedWith())
      }

      if (mark) await deps.mark.write(null).catch(() => undefined)
      return refuse('finish', 'failed', 'keyMissing', finishedWith())
    }
    const { accountId, credentialId } = mark
    const stage = mark.stage
    set({ finishStage: stage })
    try {
      const challenge = await deps.server.signInChallenge()
      const { challenge: value } = challenge.options as { challenge?: unknown }
      if (typeof value !== 'string' || value === '')
        return refuse('finish', 'failed', 'options', { finishing: true })

      const assertion = await deps.ceremonies.get({
        challenge: value,
        rpId: mark.rpId ?? deps.rpId(),
        userVerification: 'required',
        ...(credentialId && {
          allowCredentials: [{ id: credentialId, type: 'public-key' }],
        }),
        timeout: 300_000,
      })

      assertion.prf?.fill(0)
      const signIn = await deps.server.assert({
        challengeToken: challenge.challengeToken,
        response: assertion.response as unknown as PasskeyResponseJSON,
      })
      const ticket = signIn.ticket
      if (
        !ticket ||
        signIn.credentialId !== assertion.response.id ||
        signIn.accountId !== accountId ||
        signIn.accountPub !== accountPub
      )
        return refuse('finish', 'wrongPasskey', 'mismatch', {
          finishing: true,
        })
      const key = accountKey
      await created(
        {
          accountId,
          accountPub,
          credentialId: signIn.credentialId,
          rpId: mark.rpId,
          signInOnly: mark.signInOnly ?? false,
          passkeyName: mark.passkeyName,
        },
        () =>
          deps.account.openWebSessionWithTicket(ticket, key, {
            expectAccountId: accountId,
          }),
        true
      )
    } catch (error) {
      if (unknownPasskey(error)) {
        if (stage === 'created') {
          emit({
            type: 'failed',
            step: 'finish',
            reason: 'passkeyFailed:unknown_credential',
          })
          return set({
            busy: false,
            finishing: true,
            problem: null,
            heldKey: held(accountKey, 'passkeyGone'),
          })
        }

        await forgetAttempt(accountKey, mark).catch(() => undefined)
        return refuse('finish', 'notCreated', 'notCreated', finishedWith())
      }
      if (otherUserPasskey(error))
        return refuse('finish', 'wrongPasskey', 'passkeyFailed:user_handle', {
          finishing: true,
        })
      if (
        error instanceof PasskeyError &&
        (error.code === 'cancelled' || error.code === 'timeout')
      ) {
        emit({ type: 'failed', step: 'finish', reason: error.code })
        return set({
          busy: false,
          finishing: true,
          problem: {
            failure: 'pickPasskey',
            retryAfterMs: null,
            ...(mark.passkeyName && { passkeyName: mark.passkeyName }),
          },
        })
      }
      failed('finish', error, { finishing: true })
    }
  }

  async function clearForSignUp(): Promise<false | 'sent' | 'created'> {
    let owner: string | null
    try {
      owner = await deps.owner.read()
    } catch {
      throw new CantStart('keptData')
    }
    if (owner !== null && owner !== '') throw new CantStart('keptData')
    let mark: WebSignUpMark | null
    let unreadable = false
    try {
      mark = await deps.mark.read()
    } catch {
      mark = null
      unreadable = true
    }
    if (mark && mark.stage !== 'key') return mark.stage

    const stored = await deps.accountKey.readStored()
    if (stored) {
      if (unreadable) throw new CantStart('markUnreadable', stored)
      if (!mark || publicKeyOf(stored) !== mark.accountPub)
        throw new CantStart('keyPresent')
      await forgetAttempt(stored, mark)
    } else if (mark || unreadable) await deps.mark.write(null)
    return false
  }

  async function run(turnstileToken: string): Promise<void> {
    let step: WebSignUpStep = 'options'
    let accountKey: Uint8Array | null = null
    let passkey: { rpId?: string; credentialId?: string } = {}
    let prf: Uint8Array | null = null
    let current: Attempt
    let request: WebSignUpRequest
    try {
      const left = await clearForSignUp()
      if (left)
        return set({
          busy: false,
          finishing: true,
          finishStage: left,
          heldKey: null,
        })

      const answer = await deps.server.options(turnstileToken)
      const rpId = deps.rpId()
      const built = signUpCreationOptions(answer, rpId)
      if (!built.ok) return refuse('options', 'failed', 'options')
      const { accountId } = answer

      step = 'key'
      accountKey = await deps.accountKey.create()
      const accountPub = publicKeyOf(accountKey)
      await deps.mark.write({ accountId, accountPub, stage: 'key' })

      step = 'create'
      const made = await deps.ceremonies.create(built.options)
      made.prf.first?.fill(0)
      const credentialId = made.response.rawId
      passkey = { rpId, credentialId }
      const name = passkeyName(answer.userHandle)

      await deps.mark.write({
        accountId,
        accountPub,
        stage: 'key',
        credentialId,
        rpId,
        passkeyName: name,
      })
      prf =
        made.prf.enabled === false ? null : await confirmPrf(credentialId, rpId)
      const wrap = prf && {
        wrapId: newPasskeyWrapId(deps.randomBytes),
        wrap: wrapAccountKey(
          {
            prfOutput: prf,
            accountKey,
            accountId,
            credentialId,
            keyEpoch: 0,
          },
          deps.randomBytes(24)
        ),
      }
      prf?.fill(0)
      prf = null

      const label = deps.label(accountKey)
      request = {
        challengeToken: answer.challengeToken,
        response: made.response as unknown as PasskeyResponseJSON,
        ...wrap,
        ...(label !== undefined && { label, device: label }),
        appVersion: deps.appVersion?.(),
      }
      attempt = current = {
        accountId,
        accountKey,
        accountPub,
        credentialId,
        rpId,
        signInOnly: !wrap,
        passkeyName: name,
        request,
      }
      step = 'signup'

      await deps.mark.write({
        accountId,
        accountPub,
        stage: 'sent',
        credentialId,
        rpId,
        signInOnly: !wrap,
        passkeyName: name,
      })
    } catch (error) {
      prf?.fill(0)
      if (error instanceof CantStart && error.stored) {
        emit({ type: 'failed', step: 'options', reason: error.reason })
        return set({ busy: false, heldKey: held(error.stored, 'unreadable') })
      }
      if (error instanceof CantStart)
        return refuse('options', 'failed', error.reason)

      if (accountKey)
        await forgetAttempt(accountKey, passkey).catch(() => undefined)
      return failed(step, error)
    }
    await submit(current, request)
  }

  async function signUp(turnstileToken: string): Promise<void> {
    if (state.busy || state.finishing || state.recoveryKey) return
    set({ busy: true, problem: null })
    emit({ type: 'started' })
    if (deps.account.state().status !== 'signedOut')
      return refuse('options', 'failed', 'keptData')
    try {
      const held = await deps.lock(() => run(turnstileToken))
      if (!held) refuse('options', 'otherTab', 'otherTab')
    } catch (error) {
      failed('options', error)
    }
  }

  async function finish(): Promise<void> {
    if (state.busy || !state.finishing) return
    set({ busy: true, problem: null })
    try {
      const held = await deps.lock(() =>
        attempt?.request
          ? submit(attempt, attempt.request)
          : finishWithPasskey()
      )
      if (!held) refuse('finish', 'otherTab', 'otherTab', { finishing: true })
    } catch (error) {
      failed('finish', error, { finishing: true })
    }
  }

  async function passkeyIsGone(): Promise<void> {
    if (state.busy || !state.finishing) return
    set({ busy: true, problem: null })
    try {
      const got = await deps.lock(async () => {
        const mark = await deps.mark.read()
        const stored = await deps.accountKey.readStored()
        if (!mark || mark.stage === 'key') {
          attempt = null
          return refuse('finish', 'notCreated', 'notCreated', finishedWith())
        }
        if (!stored || publicKeyOf(stored) !== mark.accountPub) {
          attempt = null
          await deps.mark.write(null).catch(() => undefined)
          return refuse('finish', 'failed', 'keyMissing', finishedWith())
        }
        set({
          busy: false,
          finishStage: mark.stage,
          heldKey: held(
            stored,
            mark.stage === 'created' ? 'passkeyGone' : 'mayExist'
          ),
        })
      })
      if (!got) refuse('finish', 'otherTab', 'otherTab', { finishing: true })
    } catch (error) {
      failed('finish', error, { finishing: true, heldKey: null })
    }
  }

  async function forgetUnknownAccount(accountKey: Uint8Array): Promise<void> {
    if (state.busy) return
    set({ busy: true })
    try {
      await deps.lock(async () => {
        let mark: WebSignUpMark | null = null
        try {
          mark = await deps.mark.read()
        } catch {}
        const stored = await deps.accountKey.readStored()
        if (
          mark?.stage === 'created' ||
          !stored ||
          !sameBytes(stored, accountKey)
        )
          return set({ busy: false })
        await forgetAttempt(stored, mark ?? {})
        refuse('finish', 'notCreated', 'notCreated', finishedWith())
      })
    } catch (error) {
      failed('finish', error)
    }
    if (state.busy) set({ busy: false })
  }

  async function resume(accountId: string | null): Promise<void> {
    if (state.busy || attempt) return set({ ready: true })
    let mark: WebSignUpMark | null = null
    try {
      mark = await deps.mark.read()
    } catch {
      return resumeUnreadable(accountId)
    }
    if (accountId !== null) {
      if (mark?.accountId === accountId && mark.stage !== 'key')
        return set({
          ...finishedWith(),
          ready: true,
          recoveryKey: { signInOnly: mark.signInOnly ?? false },
        })

      if (mark) await deps.mark.write(null).catch(() => undefined)
      return set({ ...finishedWith(), ready: true, recoveryKey: null })
    }
    if (mark?.stage === 'key') {
      await deps
        .lock(async () => {
          const now = await deps.mark.read()
          if (now?.stage !== 'key') return
          const stale = await deps.accountKey.readStored()
          if (stale && publicKeyOf(stale) === now.accountPub)
            await forgetAttempt(stale, now)
          else await deps.mark.write(null)
        })
        .catch(() => undefined)
      return set({ ...finishedWith(), ready: true, recoveryKey: null })
    }
    set({
      ready: true,
      finishing: mark !== null,
      finishStage: mark?.stage ?? null,
      heldKey: null,
      recoveryKey: null,
    })
  }

  async function resumeUnreadable(accountId: string | null): Promise<void> {
    const plain = { ...finishedWith(), ready: true, recoveryKey: null }
    if (accountId !== null) {
      await deps.mark.write(null).catch(() => undefined)
      return set(plain)
    }
    let stored: Uint8Array | null
    try {
      stored = await deps.accountKey.readStored()
    } catch {
      return set(plain)
    }
    if (stored) return set({ ...plain, heldKey: held(stored, 'unreadable') })
    await deps
      .lock(async () => {
        if (!(await deps.accountKey.readStored())) await deps.mark.write(null)
      })
      .catch(() => undefined)
    set(plain)
  }

  async function confirmRecoveryKey(): Promise<void> {
    await deps.mark.write(null).catch(() => undefined)
    emit({ type: 'recoveryKeySaved' })
    set({ recoveryKey: null })
  }

  return {
    state: (): WebSignUpState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    signUp,
    finish,
    passkeyIsGone,
    forgetUnknownAccount,
    resume,
    confirmRecoveryKey,

    clearProblem: () => set({ problem: null }),
  }
}

export type WebSignUp = ReturnType<typeof createWebSignUp>
