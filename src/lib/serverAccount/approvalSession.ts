import {
  type ApprovalAccountKey,
  type ApprovalHello,
  type ApprovalKeys,
  type ApprovalOffer,
  buildApprovalLink,
  createApprovalOffer,
  createBrowserToken,
  deriveApprovalClaimToken,
  deriveApprovalHelloKey,
  deriveApprovalKeys,
  openApprovalHello,
  openApprovalKey,
  type ParsedApprovalLink,
  parseApprovalLink,
  sealApprovalHello,
  sealApprovalKey,
} from '@/lib/serverAccount/approval'
import {
  type ApprovalLocation,
  type ApprovalStatus,
  approvalStatusAsBrowser,
  approvalStatusAsPhone,
  type BrowserToken,
  cancelApprovalAsBrowser,
  cancelApprovalAsPhone,
  claimApproval,
  finishApproval,
  openApproval,
  receiveApproval,
  sendApprovalKey,
} from '@/lib/serverAccount/approvalClient'
import {
  type ChannelEvent,
  type ChannelFailure,
  channelFailureFor,
  type ChannelSessionDeps,
  createCore,
  createPollFailures,
} from '@/lib/serverAccount/channelSession'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import {
  createHandoffKeyPair,
  deriveVerifier,
} from '@/lib/serverAccount/handoff'

export type ApprovalRole = 'browser' | 'phone'

export type ApprovalFailure = ChannelFailure

export type ApprovalEvent = ChannelEvent<ApprovalStatus>

export type ApprovalSessionDeps = ChannelSessionDeps<ApprovalStatus>

export const approvalFailureFor = (
  error: unknown,
  op: { claim?: boolean } = {}
): ApprovalFailure => channelFailureFor(error, op)

export type BrowserApprovalDebugSnapshot = {
  role: 'browser'
  step: BrowserApprovalState['step']

  channels: string[]
  claimedChannelId: string | null
  codes: number
  code: string | null
  failure: ApprovalFailure | null
  events: ApprovalEvent[]
}

export type PhoneApprovalDebugSnapshot = {
  role: 'phone'
  step: PhoneApprovalState['step']
  channelId: string | null
  status: ApprovalStatus | null
  browserPub: string | null
  phonePub: string
  code: string | null
  failure: ApprovalFailure | null
  events: ApprovalEvent[]
}

export const APPROVAL_ROTATE_MS = 60_000

export const APPROVAL_MAX_CODES = 10

export const APPROVAL_POLL_MS = 1_500

export type ApprovalReceived = ApprovalAccountKey & {
  ticket: string
  ticketExpiresAt: number
}

export type BrowserApprovalState =
  | { step: 'idle' }
  | { step: 'opening' }
  | { step: 'showing'; link: string; expiresAt: number; codes: number }
  | { step: 'expired' }
  | { step: 'claimed'; code: string; expiresAt: number }
  | { step: 'received'; code: string; received: ApprovalReceived }
  | { step: 'finishing'; deviceName: string }
  | { step: 'done'; deviceName: string }
  | { step: 'cancelled' }
  | { step: 'failed'; reason: ApprovalFailure }

export type BrowserApprovalDeps = ApprovalSessionDeps & {
  origin: string

  hello: ApprovalHello
}

type Channel = {
  offer: ApprovalOffer
  privateKey: Uint8Array
  token: BrowserToken
  expiresAt: number
}

export type BrowserApproval = ReturnType<typeof createBrowserApproval>

export function createBrowserApproval(deps: BrowserApprovalDeps) {
  const core = createCore<BrowserApprovalState, ApprovalStatus, ApprovalRole>(
    'browser',
    { step: 'idle' },
    deps
  )

  let channels: Channel[] = []
  let current: Channel | null = null
  let claimed: { channel: Channel; keys: ApprovalKeys } | null = null
  let codes = 0
  let rotateTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let polling = false
  let opening = false
  let failure: ApprovalFailure | null = null
  const pollFailures = createPollFailures()

  const options = () => ({ baseUrl: deps.baseUrl, fetchImpl: deps.fetchImpl })

  const terminal = () =>
    ['done', 'cancelled', 'failed'].includes(core.state.step)

  function stopRotating() {
    if (rotateTimer) clearTimeout(rotateTimer)
    rotateTimer = null
  }

  function stopTimers() {
    stopRotating()
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  const cancelOnServer = (channel: Channel) =>
    core
      .call('approval/cancel', () =>
        cancelApprovalAsBrowser(channel.token, options())
      )
      .catch(() => undefined)

  function cancelChannels(keep: Channel | null = null) {
    const others = channels.filter((channel) => channel !== keep)
    channels = keep ? [keep] : []
    for (const channel of others) void cancelOnServer(channel)
  }

  function endAll() {
    stopTimers()
    const ending = [...channels]
    if (claimed && !ending.includes(claimed.channel))
      ending.push(claimed.channel)
    channels = []
    current = null
    return Promise.all(ending.map(cancelOnServer))
  }

  function fail(reason: ApprovalFailure) {
    failure = reason
    void endAll()
    core.set({ step: 'failed', reason })
  }

  async function openChannel(): Promise<void> {
    if (opening || terminal() || claimed) return
    opening = true
    const { offer, keyPair } = createApprovalOffer(deps.randomBytes)
    const { browserToken, browserVerifier } = createBrowserToken(
      deps.randomBytes
    )
    const hello = sealApprovalHello(
      deriveApprovalHelloKey(offer.secret, offer.channelId),
      offer.channelId,
      deps.hello,
      deps.randomBytes
    )
    try {
      const opened = await core.call('approval/open', () =>
        openApproval(
          {
            channelId: offer.channelId,
            verifier: deriveVerifier(
              deriveApprovalClaimToken(offer.secret, offer.channelId)
            ),
            browserVerifier,
            hello,
          },
          options()
        )
      )
      const channel: Channel = {
        offer,
        privateKey: keyPair.privateKey,
        token: { channelId: offer.channelId, browserToken },
        expiresAt: opened.expiresAt,
      }

      if (terminal() || claimed || core.state.step === 'expired')
        return void (await cancelOnServer(channel))
      channels.push(channel)
      current = channel
      codes += 1
      core.set({
        step: 'showing',
        link: buildApprovalLink(offer, deps.origin),
        expiresAt: opened.expiresAt,
        codes,
      })
      scheduleRotation()
    } catch (error) {
      if (terminal() || claimed) return
      const reason = approvalFailureFor(error)

      if (!current || pollFailures.endsAttempt(reason)) fail(reason)
      else scheduleRotation(APPROVAL_POLL_MS)
    } finally {
      opening = false
    }
  }

  function scheduleRotation(ms = APPROVAL_ROTATE_MS) {
    stopRotating()
    rotateTimer = setTimeout(() => {
      rotateTimer = null
      void rotate()
    }, ms)
  }

  async function rotate(): Promise<void> {
    if (terminal() || claimed || core.state.step === 'expired') return
    if (codes >= APPROVAL_MAX_CODES) {
      current = null
      core.set({ step: 'expired' })
      return
    }
    await openChannel()
  }

  function claim(channel: Channel, phonePub: string, expiresAt: number) {
    let keys: ApprovalKeys
    try {
      keys = deriveApprovalKeys({
        privateKey: channel.privateKey,
        peerPublicKey: phonePub,
        secret: channel.offer.secret,
        channelId: channel.offer.channelId,
        browserPub: channel.offer.browserPub,
        phonePub,
      })
    } catch {
      core.log({ op: 'claim', outcome: 'tampered' })
      return fail('tampered')
    }
    stopRotating()
    claimed = { channel, keys }
    cancelChannels(channel)
    core.set({ step: 'claimed', code: keys.code, expiresAt })
  }

  async function pollChannels(): Promise<void> {
    const now = deps.now()
    channels = channels.filter((channel) => channel.expiresAt > now)
    if (current && current.expiresAt <= now) current = null
    if (core.state.step === 'expired' && channels.length === 0) return
    for (const channel of [...channels].reverse()) {
      if (terminal() || claimed) return
      let view
      try {
        view = await core.call(
          'approval/status',
          () => approvalStatusAsBrowser(channel.token, options()),
          (value) => value.status
        )
        pollFailures.succeeded()
      } catch (error) {
        if (terminal() || claimed) return
        const reason = approvalFailureFor(error)
        if (reason === 'expired' || reason === 'cancelled') {
          drop(channel)
          continue
        }
        if (pollFailures.endsAttempt(reason)) return fail(reason)
        continue
      }
      if (terminal() || claimed) return

      if (!channels.includes(channel)) continue

      if (
        (view.status === 'claimed' || view.status === 'sent') &&
        view.phonePub
      )
        return claim(channel, view.phonePub, view.expiresAt)

      if (view.status === 'cancelled') return fail('cancelled')
      if (view.status !== 'open' && view.status !== 'claimed') drop(channel)
    }
  }

  function drop(channel: Channel) {
    channels = channels.filter((other) => other !== channel)
    if (channel === current) {
      current = null
      void rotate()
    }
  }

  async function pollReceive(): Promise<void> {
    if (!claimed || core.state.step !== 'claimed') return
    const { channel, keys } = claimed
    if (deps.now() >= core.state.expiresAt) return fail('expired')
    let view
    try {
      view = await core.call(
        'approval/receive',
        () => receiveApproval(channel.token, options()),
        (value) => value.status
      )
      pollFailures.succeeded()
    } catch (error) {
      if (terminal()) return
      const reason = approvalFailureFor(error)
      if (pollFailures.endsAttempt(reason)) fail(reason)
      return
    }
    if (core.state.step !== 'claimed') return
    if (view.status === 'cancelled') return fail('cancelled')
    if (view.status === 'done') return fail('conflict')
    if (
      view.status !== 'sent' ||
      !view.key ||
      !view.ticket ||
      view.ticketExpiresAt === undefined
    )
      return
    let key: ApprovalAccountKey
    try {
      key = openApprovalKey(keys.keyKey, channel.offer.channelId, view.key)
    } catch {
      core.log({ op: 'open key', outcome: 'tampered' })
      return fail('tampered')
    }
    stopTimers()
    core.set({
      step: 'received',
      code: keys.code,
      received: {
        ...key,
        ticket: view.ticket,
        ticketExpiresAt: view.ticketExpiresAt,
      },
    })
  }

  async function tick(): Promise<void> {
    if (polling || terminal()) return
    polling = true
    try {
      if (claimed) await pollReceive()
      else await pollChannels()
    } finally {
      polling = false
    }
  }

  async function start(): Promise<void> {
    if (core.state.step !== 'idle') return
    core.set({ step: 'opening' })
    pollTimer = setInterval(() => void tick(), APPROVAL_POLL_MS)
    await openChannel()
  }

  async function restart(): Promise<void> {
    if (core.state.step !== 'expired') return
    cancelChannels()
    codes = 0
    core.set({ step: 'opening' })
    await openChannel()
  }

  async function finish(): Promise<void> {
    const state = core.state
    if (state.step !== 'received' || !claimed) return
    const { deviceName } = state.received
    core.set({ step: 'finishing', deviceName })
    const token = claimed.channel.token
    const done = () =>
      core.call('approval/done', () => finishApproval(token, options()))
    try {
      try {
        await done()
      } catch (error) {
        if (approvalFailureFor(error) !== 'offline') throw error
        await done()
      }
    } catch (error) {
      core.log({ op: 'done', outcome: approvalFailureFor(error) })
    }

    if (core.state.step !== 'finishing') return
    core.set({ step: 'done', deviceName })
  }

  async function cancel(): Promise<void> {
    if (terminal()) return
    const ended = endAll()
    core.set({ step: 'cancelled' })
    await ended
  }

  return {
    get state() {
      return core.state
    },
    subscribe: core.subscribe,
    start,
    restart,
    finish,
    cancel,

    dispose: () => void cancel(),

    fail: (reason: ApprovalFailure) => {
      if (!terminal()) fail(reason)
    },
    debug: (): BrowserApprovalDebugSnapshot => ({
      role: 'browser',
      step: core.state.step,
      channels: channels.map((channel) => channel.offer.channelId),
      claimedChannelId: claimed?.channel.offer.channelId ?? null,
      codes,
      code: claimed?.keys.code ?? null,
      failure,
      events: [...core.events],
    }),
  }
}

export type PhoneApprovalState =
  | {
      step: 'invalid'
      problem: Exclude<ParsedApprovalLink, { ok: true }>['problem']
    }
  | { step: 'idle' }
  | { step: 'claiming' }
  | {
      step: 'confirm'
      hello: ApprovalHello
      location?: ApprovalLocation
      far: boolean
      code: string
      expiresAt: number
      sendFailed?: boolean
    }
  | {
      step: 'sending'
      hello: ApprovalHello
      location?: ApprovalLocation
      far: boolean
      code: string
      expiresAt: number
    }
  | { step: 'done'; hello: ApprovalHello }
  | { step: 'declined'; hello: ApprovalHello | null }
  | { step: 'cancelled' }
  | { step: 'failed'; reason: ApprovalFailure }

export type PhoneApprovalAccount = {
  accountKey: Uint8Array
  accountId: string

  deviceName: string

  authorize: AccountAuthorize
}

export type PhoneApprovalDeps = ApprovalSessionDeps & {
  origins: readonly string[]
}

export type PhoneApproval = ReturnType<typeof createPhoneApproval>

export function createPhoneApproval(
  scanned: string,
  account: PhoneApprovalAccount,
  deps: PhoneApprovalDeps
) {
  const parsed = parseApprovalLink(scanned, deps.origins)
  const keyPair = createHandoffKeyPair(deps.randomBytes)

  let keys: ApprovalKeys | null = null
  if (parsed.ok)
    try {
      keys = deriveApprovalKeys({
        privateKey: keyPair.privateKey,
        peerPublicKey: parsed.offer.browserPub,
        secret: parsed.offer.secret,
        channelId: parsed.offer.channelId,
        browserPub: parsed.offer.browserPub,
        phonePub: keyPair.publicKey,
      })
    } catch {
      keys = null
    }
  const core = createCore<PhoneApprovalState, ApprovalStatus, ApprovalRole>(
    'phone',
    !parsed.ok
      ? { step: 'invalid', problem: parsed.problem }
      : keys
        ? { step: 'idle' }
        : { step: 'invalid', problem: 'damaged' },
    deps
  )
  const offer = parsed.ok && keys ? parsed.offer : null

  let sealedKey: string | null = null
  let status: ApprovalStatus | null = null
  let failure: ApprovalFailure | null = null

  let held = false
  let polling = false

  const options = () => ({
    baseUrl: deps.baseUrl,
    authorize: account.authorize,
    fetchImpl: deps.fetchImpl,
  })

  const terminal = () =>
    ['invalid', 'done', 'declined', 'cancelled', 'failed'].includes(
      core.state.step
    )

  const fail = (reason: ApprovalFailure) => {
    failure = reason
    core.set({ step: 'failed', reason })
  }

  const cancelOnServer = () =>
    offer && held
      ? core
          .call('approval/cancel', () =>
            cancelApprovalAsPhone(offer.channelId, options())
          )
          .then(() => {
            status = 'cancelled'
          })
          .catch(() => undefined)
      : Promise.resolve()

  async function claim(): Promise<void> {
    if (core.state.step !== 'idle' || !offer || !keys) return
    const derived = keys
    core.set({ step: 'claiming' })
    const body = {
      channelId: offer.channelId,
      claimToken: deriveApprovalClaimToken(offer.secret, offer.channelId),
      phonePub: keyPair.publicKey,
    }
    const send = () =>
      core.call('approval/claim', () => claimApproval(body, options()))
    try {
      let answer
      try {
        answer = await send()
      } catch (error) {
        if (approvalFailureFor(error, { claim: true }) !== 'offline')
          throw error
        held = true
        answer = await send()
      }
      held = true
      status = 'claimed'
      if (terminal()) return void (await cancelOnServer())
      let hello: ApprovalHello
      try {
        hello = openApprovalHello(
          deriveApprovalHelloKey(offer.secret, offer.channelId),
          offer.channelId,
          answer.hello
        )
      } catch {
        core.log({ op: 'open hello', outcome: 'tampered' })
        fail('tampered')
        void cancelOnServer()
        return
      }
      core.set({
        step: 'confirm',
        hello,
        ...(answer.location && { location: answer.location }),
        far: answer.far,
        code: derived.code,
        expiresAt: answer.expiresAt,
      })
    } catch (error) {
      if (!terminal()) fail(approvalFailureFor(error, { claim: true }))

      void cancelOnServer()
    }
  }

  async function approve(): Promise<void> {
    const state = core.state
    if (state.step !== 'confirm' || !keys || !offer) return
    if (deps.now() >= state.expiresAt) {
      fail('expired')
      return
    }
    const { sendFailed: _, ...asked } = state
    core.set({ ...asked, step: 'sending' })
    sealedKey ??= sealApprovalKey(
      keys.keyKey,
      offer.channelId,
      {
        accountKey: account.accountKey,
        accountId: account.accountId,
        deviceName: account.deviceName,
      },
      deps.randomBytes
    )
    const key = sealedKey
    try {
      await core.call('approval/send', () =>
        sendApprovalKey({ channelId: offer.channelId, key }, options())
      )
      if (terminal()) return
      status = 'sent'
      core.set({ step: 'done', hello: asked.hello })
    } catch (error) {
      if (terminal()) return
      const reason = approvalFailureFor(error)
      if (reason !== 'offline' && reason !== 'conflict') {
        fail(reason)
        return void cancelOnServer()
      }
      await settleSend(asked, reason)
    }
  }

  async function settleSend(
    asked: Omit<Extract<PhoneApprovalState, { step: 'confirm' }>, 'sendFailed'>,
    reason: 'offline' | 'conflict'
  ): Promise<void> {
    let view: ApprovalStatus
    try {
      view = (
        await core.call(
          'approval/status',
          () => approvalStatusAsPhone(offer!.channelId, options()),
          (value) => value.status
        )
      ).status
    } catch {
      if (!terminal()) core.set({ ...asked, step: 'confirm', sendFailed: true })
      return
    }
    if (terminal()) return
    status = view
    if (view === 'sent' || view === 'done')
      core.set({ step: 'done', hello: asked.hello })
    else if (view === 'cancelled') fail('cancelled')
    else if (view === 'claimed' && reason === 'offline')
      core.set({ ...asked, step: 'confirm', sendFailed: true })
    else {
      fail(reason)
      void cancelOnServer()
    }
  }

  async function poll(): Promise<void> {
    if (polling || core.state.step !== 'confirm' || !offer) return
    if (deps.now() >= core.state.expiresAt) return fail('expired')
    polling = true
    try {
      const view = await core.call(
        'approval/status',
        () => approvalStatusAsPhone(offer.channelId, options()),
        (value) => value.status
      )
      if (core.state.step !== 'confirm') return
      status = view.status
      if (view.status === 'cancelled') fail('cancelled')
    } catch (error) {
      if (core.state.step !== 'confirm') return
      const reason = approvalFailureFor(error)
      if (reason === 'expired') fail(reason)
    } finally {
      polling = false
    }
  }

  async function decline(): Promise<void> {
    if (terminal()) return
    const state = core.state
    core.set({
      step: 'declined',
      hello: 'hello' in state ? state.hello : null,
    })
    await cancelOnServer()
  }

  async function cancel(): Promise<void> {
    if (terminal() || core.state.step === 'sending') return
    core.set({ step: 'cancelled' })
    await cancelOnServer()
  }

  return {
    get state() {
      return core.state
    },
    subscribe: core.subscribe,
    channelId: offer?.channelId ?? null,
    claim,
    approve,
    decline,
    cancel,
    poll,
    debug: (): PhoneApprovalDebugSnapshot => ({
      role: 'phone',
      step: core.state.step,
      channelId: offer?.channelId ?? null,
      status,
      browserPub: offer?.browserPub ?? null,
      phonePub: keyPair.publicKey,
      code: keys?.code ?? null,
      failure,
      events: [...core.events],
    }),
  }
}
