import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest'
import { fromB64u, toB64u } from '@/lib/bytes'
import type { AccountAuthorize } from '@/lib/serverAccount/client'
import {
  buildApprovalLink,
  parseApprovalLink,
} from '@/lib/serverAccount/approval'
import {
  APPROVAL_MAX_CODES,
  APPROVAL_POLL_MS,
  APPROVAL_ROTATE_MS,
  createBrowserApproval,
  createPhoneApproval,
} from '@/lib/serverAccount/approvalSession'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))
vi.mock('@/lib/http/online', () => ({ isKnownOffline: () => false }))

const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const ORIGIN = 'https://app.witnesswork.app'
const ORIGINS = [ORIGIN]
const HELLO = { browser: 'Chrome', system: 'macOS', appVersion: '3.1.0' }
const UNCLAIMED_MS = 75_000
const CLAIMED_MS = 5 * 60_000

type Channel = {
  verifier: string
  browserVerifier: string
  hello: string
  status: 'open' | 'claimed' | 'sent' | 'done' | 'cancelled'
  expiresAt: number
  claimBody?: string
  phonePub?: string
  key?: string
}

/**
 * An in-memory approval relay with the contract's rules, and hooks to lose an
 * answer or fail an op.
 */
function fakeRelay() {
  const channels = new Map<string, Channel>()
  const calls: { op: string; channelId: string }[] = []
  /** Runs the op, then drops its answer (a lost response). */
  const lose = new Set<string>()
  /** Answers the op with this error, without running it. */
  const fails = new Map<string, { status: number; error: string }>()
  const hash = (token: string) => toB64u(sha256(fromB64u(token)))

  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    const op = url.split('/accounts/v1/')[1]
    const body = JSON.parse(init.body as string) as Record<string, string>
    const bearer = (init.headers as Record<string, string>).authorization
    calls.push({ op, channelId: body.channelId })
    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    const failure = fails.get(op)
    if (failure) {
      fails.delete(op)
      return reply(failure.status, { ok: false, error: failure.error })
    }
    const answer = handle(op, body, bearer)
    if (lose.has(op)) {
      lose.delete(op)
      throw new TypeError('Network request failed')
    }
    return reply(answer[0], answer[1])
  }) as unknown as typeof fetch

  function handle(
    op: string,
    body: Record<string, string>,
    bearer: string | undefined
  ): [number, unknown] {
    const error = (status: number, code: string): [number, unknown] => [
      status,
      { ok: false, error: code },
    ]
    if (op === 'approval/open') {
      channels.set(body.channelId, {
        verifier: body.verifier,
        browserVerifier: body.browserVerifier,
        hello: body.hello,
        status: 'open',
        expiresAt: Date.now() + UNCLAIMED_MS,
      })
      return [200, { ok: true, expiresAt: Date.now() + UNCLAIMED_MS }]
    }
    const channel = channels.get(body.channelId)
    if (!channel || channel.expiresAt <= Date.now())
      return error(404, 'not_found')
    const asBrowser = 'browserToken' in body
    if (asBrowser && hash(body.browserToken) !== channel.browserVerifier)
      return error(401, 'bad_signature')
    if (!asBrowser && op !== 'approval/open' && bearer !== 'Bearer phone')
      return error(401, 'unauthorized')
    switch (op) {
      case 'approval/claim': {
        if (hash(body.claimToken) !== channel.verifier)
          return error(401, 'bad_signature')
        const sent = JSON.stringify(body)
        if (channel.claimBody && channel.claimBody !== sent)
          return error(409, 'conflict')
        if (channel.status !== 'open' && channel.claimBody !== sent)
          return error(409, 'conflict')
        if (!channel.claimBody) {
          channel.claimBody = sent
          channel.phonePub = body.phonePub
          channel.status = 'claimed'
          channel.expiresAt = Date.now() + CLAIMED_MS
        }
        return [
          200,
          {
            ok: true,
            expiresAt: channel.expiresAt,
            hello: channel.hello,
            location: { city: 'Springfield', country: 'US' },
            far: false,
          },
        ]
      }
      case 'approval/status':
        return [
          200,
          {
            ok: true,
            status: channel.status,
            expiresAt: channel.expiresAt,
            ...(channel.phonePub && { phonePub: channel.phonePub }),
          },
        ]
      case 'approval/send':
        if (channel.status === 'sent' && channel.key === body.key)
          return [200, { ok: true }]
        if (channel.status !== 'claimed') return error(409, 'conflict')
        channel.key = body.key
        channel.status = 'sent'
        return [200, { ok: true }]
      case 'approval/receive':
        return [
          200,
          {
            ok: true,
            status: channel.status,
            ...(channel.status === 'sent' && {
              key: channel.key,
              ticket: 'approval-ticket',
              ticketExpiresAt: Date.now() + 120_000,
            }),
          },
        ]
      case 'approval/done':
        if (channel.status !== 'sent' && channel.status !== 'done')
          return error(409, 'conflict')
        channel.status = 'done'
        channel.key = undefined
        channel.phonePub = undefined
        return [200, { ok: true }]
      case 'approval/cancel':
        // Ending a channel drops everything but its status, the phone's key
        // too, as the Durable Object does.
        if (channel.status !== 'done') {
          channel.status = 'cancelled'
          channel.key = undefined
          channel.phonePub = undefined
        }
        return [200, { ok: true }]
    }
    return error(400, 'bad_request')
  }

  const opsFor = (channelId: string) =>
    calls.filter((call) => call.channelId === channelId).map((call) => call.op)
  return { channels, calls, lose, fails, fetchImpl, opsFor }
}

const phoneAuthorize: AccountAuthorize = (run) => run('Bearer phone')

function setup() {
  const relay = fakeRelay()
  const deps = {
    baseUrl: 'https://api.test',
    now: () => Date.now(),
    randomBytes: random,
    fetchImpl: relay.fetchImpl,
  }
  const browser = createBrowserApproval({
    ...deps,
    origin: ORIGIN,
    hello: HELLO,
  })
  const accountKey = random(32)
  const accountId = toB64u(random(16))
  const phoneFor = (link: string, origins: readonly string[] = ORIGINS) =>
    createPhoneApproval(
      link,
      {
        accountKey,
        accountId,
        deviceName: "Sam's iPhone",
        authorize: phoneAuthorize,
      },
      { ...deps, origins }
    )
  return { relay, browser, phoneFor, accountKey, accountId }
}

const linkOf = (browser: ReturnType<typeof createBrowserApproval>) => {
  if (browser.state.step !== 'showing') throw new Error(browser.state.step)
  return browser.state.link
}

const channelOf = (link: string) =>
  toB64u(fromB64u(link.split('#1')[1]).subarray(0, 16))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_800_000_000_000)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('approving a browser', () => {
  it('hands the account key from the phone to the browser', async () => {
    const { relay, browser, phoneFor, accountKey, accountId } = setup()
    await browser.start()
    const link = linkOf(browser)
    expect(link.startsWith(`${ORIGIN}/approve#1`)).toBe(true)

    const phone = phoneFor(link)
    await phone.claim()
    expect(phone.state).toMatchObject({
      step: 'confirm',
      hello: HELLO,
      location: { city: 'Springfield', country: 'US' },
      far: false,
    })
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('claimed')
    if (browser.state.step !== 'claimed' || phone.state.step !== 'confirm')
      return
    expect(browser.state.code).toBe(phone.state.code)

    await phone.approve()
    expect(phone.state.step).toBe('done')
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state).toMatchObject({
      step: 'received',
      received: {
        accountKey,
        accountId,
        deviceName: "Sam's iPhone",
        ticket: 'approval-ticket',
      },
    })
    await browser.finish()
    expect(browser.state).toEqual({ step: 'done', deviceName: "Sam's iPhone" })
    expect(relay.channels.get(channelOf(link))?.status).toBe('done')

    // No timer keeps polling once it's over.
    const calls = relay.calls.length
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS * 2)
    expect(relay.calls.length).toBe(calls)
  })

  it('polls status every 1.5 s while showing the code', async () => {
    const { relay, browser } = setup()
    await browser.start()
    const channelId = channelOf(linkOf(browser))
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS * 4)
    expect(relay.opsFor(channelId)).toEqual([
      'approval/open',
      'approval/status',
      'approval/status',
      'approval/status',
      'approval/status',
    ])
    browser.dispose()
  })
})

describe('the browser', () => {
  it('rotates the code every minute and keeps polling the previous one', async () => {
    const { relay, browser } = setup()
    await browser.start()
    const first = channelOf(linkOf(browser))
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    const second = channelOf(linkOf(browser))
    expect(second).not.toBe(first)
    expect(browser.state).toMatchObject({ step: 'showing', codes: 2 })

    // The first lives 75 s: still polled until then, never after.
    const before = relay.opsFor(first).length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(relay.opsFor(first).length).toBeGreaterThan(before)
    await vi.advanceTimersByTimeAsync(10_000)
    const after = relay.opsFor(first).length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(relay.opsFor(first).length).toBe(after)
    browser.dispose()
  })

  it('takes a claim on the previous code and cancels the others', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const firstLink = linkOf(browser)
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    const second = channelOf(linkOf(browser))

    const phone = phoneFor(firstLink)
    await phone.claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('claimed')
    expect(relay.channels.get(second)?.status).toBe('cancelled')

    // Claimed: no more codes, only `receive` on the claimed channel.
    const opens = relay.calls.filter((c) => c.op === 'approval/open').length
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS * 2)
    expect(relay.calls.filter((c) => c.op === 'approval/open').length).toBe(
      opens
    )
    expect(relay.opsFor(channelOf(firstLink)).at(-1)).toBe('approval/receive')
    browser.dispose()
  })

  it('offers a new code after ten unclaimed ones', async () => {
    const { relay, browser } = setup()
    await browser.start()
    for (let code = 1; code < APPROVAL_MAX_CODES; code++)
      await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    expect(browser.state).toMatchObject({
      step: 'showing',
      codes: APPROVAL_MAX_CODES,
    })
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    expect(browser.state.step).toBe('expired')
    expect(relay.calls.filter((c) => c.op === 'approval/open')).toHaveLength(
      APPROVAL_MAX_CODES
    )
    // Polls stop once the last code has expired.
    await vi.advanceTimersByTimeAsync(UNCLAIMED_MS)
    const calls = relay.calls.length
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    expect(relay.calls.length).toBe(calls)

    await browser.restart()
    expect(browser.state).toMatchObject({ step: 'showing', codes: 1 })
    browser.dispose()
  })

  it('keeps the new code when a poll of a code it just ended answers late', async () => {
    const { relay, browser } = setup()
    await browser.start()
    for (let code = 0; code < APPROVAL_MAX_CODES; code++)
      await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    expect(browser.state.step).toBe('expired')
    // Hold the next status poll of the last code, still alive.
    const fetchMock = relay.fetchImpl as unknown as Mock<typeof fetch>
    const original = fetchMock.getMockImplementation()!
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let holding = true
    fetchMock.mockImplementation((async (url: string, init: RequestInit) => {
      if (holding && url.endsWith('approval/status')) {
        holding = false
        await held
      }
      return original(url, init)
    }) as never)
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(holding).toBe(false)
    // Show a New Code ends the old channels while that poll is out.
    await browser.restart()
    release()
    await vi.advanceTimersByTimeAsync(0)
    expect(browser.state).toMatchObject({ step: 'showing', codes: 1 })
    browser.dispose()
  })

  it('cancels the channel when the send fails outright', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    relay.fails.set('approval/send', { status: 500, error: 'internal' })
    await phone.approve()
    expect(phone.state.step).toBe('failed')
    await vi.advanceTimersByTimeAsync(0)
    expect(relay.calls.map((c) => c.op)).toContain('approval/cancel')
    expect(relay.channels.get(phone.channelId!)?.status).toBe('cancelled')
    browser.dispose()
  })

  it('cancels every channel on dispose', async () => {
    const { relay, browser } = setup()
    await browser.start()
    const first = channelOf(linkOf(browser))
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    const second = channelOf(linkOf(browser))
    await browser.cancel()
    expect(browser.state.step).toBe('cancelled')
    expect(relay.channels.get(first)?.status).toBe('cancelled')
    expect(relay.channels.get(second)?.status).toBe('cancelled')
    const calls = relay.calls.length
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS * 2)
    expect(relay.calls.length).toBe(calls)
  })

  it('fails when the phone says No', async () => {
    const { browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    await phone.decline()
    expect(phone.state.step).toBe('declined')
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })

  it('fails when the phone says No before the page saw the claim', async () => {
    const { browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    await phone.decline()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })

  it('expires five minutes after the claim', async () => {
    const { browser, phoneFor } = setup()
    await browser.start()
    await phoneFor(linkOf(browser)).claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('claimed')
    await vi.advanceTimersByTimeAsync(CLAIMED_MS)
    expect(browser.state).toEqual({ step: 'failed', reason: 'expired' })
  })

  it('fails when the first code cannot open', async () => {
    const { relay, browser } = setup()
    relay.fails.set('approval/open', { status: 429, error: 'rate_limited' })
    await browser.start()
    expect(browser.state).toEqual({ step: 'failed', reason: 'rateLimited' })
  })

  it('keeps showing a code when one poll is lost', async () => {
    const { relay, browser } = setup()
    await browser.start()
    relay.lose.add('approval/status')
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS * 2)
    expect(browser.state.step).toBe('showing')
    browser.dispose()
  })

  it('ends every channel when the phone key is low-order', async () => {
    const { relay, browser } = setup()
    await browser.start()
    const first = channelOf(linkOf(browser))
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    const second = channelOf(linkOf(browser))
    const channel = relay.channels.get(first)!
    channel.status = 'claimed'
    channel.phonePub = toB64u(new Uint8Array(32))
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state).toEqual({ step: 'failed', reason: 'tampered' })
    expect(relay.channels.get(first)?.status).toBe('cancelled')
    expect(relay.channels.get(second)?.status).toBe('cancelled')
  })

  it('takes a channel first seen already sent', async () => {
    const { browser, phoneFor, accountId } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    // Claimed and sent between two polls.
    await phone.claim()
    await phone.approve()
    expect(phone.state.step).toBe('done')
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS * 2)
    expect(browser.state).toMatchObject({
      step: 'received',
      received: { accountId },
    })
  })

  it('keeps a claim when a rotation that was in flight fails', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const link = linkOf(browser)
    const fetchMock = relay.fetchImpl as unknown as Mock<typeof fetch>
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((async (url: string, init: RequestInit) => {
      if (!url.endsWith('approval/open')) return original(url, init)
      // The next code's open hangs, then fails.
      await new Promise((resolve) => setTimeout(resolve, 3_000))
      return new Response(JSON.stringify({ ok: false, error: 'disabled' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    }) as never)
    await vi.advanceTimersByTimeAsync(APPROVAL_ROTATE_MS)
    const phone = phoneFor(link)
    await phone.claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('claimed')
    await vi.advanceTimersByTimeAsync(3_000)
    expect(browser.state.step).toBe('claimed')
    expect(relay.channels.get(channelOf(link))?.status).toBe('claimed')

    await phone.approve()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('received')
    browser.dispose()
  })

  it('tells the server it is done again after a lost answer', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const link = linkOf(browser)
    const phone = phoneFor(link)
    await phone.claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    await phone.approve()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('received')
    relay.lose.add('approval/done')
    await browser.finish()
    expect(browser.state).toEqual({ step: 'done', deviceName: "Sam's iPhone" })
    expect(
      relay.opsFor(channelOf(link)).filter((op) => op === 'approval/done')
    ).toHaveLength(2)
  })

  it('stays cancelled when disposed while finishing', async () => {
    const { browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    await phone.approve()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state.step).toBe('received')
    const finishing = browser.finish()
    expect(browser.state.step).toBe('finishing')
    browser.dispose()
    await finishing
    expect(browser.state.step).toBe('cancelled')
  })

  it('refuses a key sealed for another channel', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const link = linkOf(browser)
    await phoneFor(link).claim()
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    const channel = relay.channels.get(channelOf(link))!
    channel.status = 'sent'
    channel.key = toB64u(random(80))
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS)
    expect(browser.state).toEqual({ step: 'failed', reason: 'tampered' })
  })
})

describe('the phone', () => {
  it('refuses a code from a host this build does not trust', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const link = linkOf(browser).replace(ORIGIN, 'https://evil.example')
    const phone = phoneFor(link)
    expect(phone.state).toEqual({ step: 'invalid', problem: 'wrongHost' })
    await phone.claim()
    expect(relay.calls.some((c) => c.op === 'approval/claim')).toBe(false)
    browser.dispose()
  })

  it('refuses a code that is not an approval code', () => {
    const { phoneFor } = setup()
    expect(phoneFor('https://example.com').state).toEqual({
      step: 'invalid',
      problem: 'notApproval',
    })
  })

  it('says when another device already scanned the code', async () => {
    const { browser, phoneFor } = setup()
    await browser.start()
    const link = linkOf(browser)
    await phoneFor(link).claim()
    const second = phoneFor(link)
    await second.claim()
    expect(second.state).toEqual({ step: 'failed', reason: 'used' })
    browser.dispose()
  })

  it('claims again after a lost answer', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    relay.lose.add('approval/claim')
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    expect(phone.state.step).toBe('confirm')
    browser.dispose()
  })

  it('cancels a claim whose answer was lost twice', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const fetchMock = relay.fetchImpl as unknown as Mock<typeof fetch>
    const original = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation((async (url: string, init: RequestInit) => {
      const answer = await original(url, init)
      if (url.endsWith('approval/claim'))
        throw new TypeError('Network request failed')
      return answer
    }) as never)
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    expect(phone.state).toEqual({ step: 'failed', reason: 'offline' })
    expect(relay.opsFor(phone.channelId!)).toEqual([
      'approval/open',
      'approval/claim',
      'approval/claim',
      'approval/cancel',
    ])
    expect(relay.channels.get(phone.channelId!)?.status).toBe('cancelled')
    browser.dispose()
  })

  it('never claims a code with a low-order browser key', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const link = linkOf(browser)
    const parsed = parseApprovalLink(link, ORIGINS)
    if (!parsed.ok) throw new Error(parsed.problem)
    const lowOrder = new Uint8Array(32)
    lowOrder[0] = 1
    const crafted = buildApprovalLink(
      { ...parsed.offer, browserPub: toB64u(lowOrder) },
      ORIGIN
    )
    const phone = phoneFor(crafted)
    expect(phone.state).toEqual({ step: 'invalid', problem: 'damaged' })
    await phone.claim()
    expect(relay.calls.some((c) => c.op === 'approval/claim')).toBe(false)
    expect(relay.channels.get(channelOf(link))?.status).toBe('open')
    browser.dispose()
  })

  it('reads the status after a lost send, and the key got there', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    relay.lose.add('approval/send')
    await phone.approve()
    expect(phone.state.step).toBe('done')
    expect(relay.opsFor(phone.channelId!).slice(-2)).toEqual([
      'approval/send',
      'approval/status',
    ])
    browser.dispose()
  })

  it('fails on a server error from send', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    relay.fails.set('approval/send', { status: 503, error: 'unavailable' })
    await phone.approve()
    expect(phone.state).toEqual({ step: 'failed', reason: 'server' })
  })

  it('lets the User tap Yes again with the same key after an unanswered send', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    const sent: string[] = []
    const fetchMock = relay.fetchImpl as unknown as Mock<typeof fetch>
    const original = fetchMock.getMockImplementation()!
    let first = true
    fetchMock.mockImplementation((async (url: string, init: RequestInit) => {
      if (url.endsWith('approval/send')) {
        sent.push(JSON.parse(init.body as string).key)
        if (first) {
          first = false
          await original(url, init)
          throw new TypeError('Network request failed')
        }
      }
      if (url.endsWith('approval/status') && sent.length === 1)
        throw new TypeError('Network request failed')
      return original(url, init)
    }) as never)
    await phone.approve()
    expect(phone.state).toMatchObject({ step: 'confirm', sendFailed: true })
    await phone.approve()
    expect(phone.state.step).toBe('done')
    expect(sent).toHaveLength(2)
    expect(sent[0]).toBe(sent[1])
    browser.dispose()
  })

  it('lets a send that is out decide when the screen closes', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    const fetchMock = relay.fetchImpl as unknown as Mock<typeof fetch>
    const original = fetchMock.getMockImplementation()!
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    fetchMock.mockImplementation((async (url: string, init: RequestInit) => {
      if (url.endsWith('approval/send')) await held
      return original(url, init)
    }) as never)
    const approving = phone.approve()
    await vi.advanceTimersByTimeAsync(0)
    await phone.cancel()
    release()
    await approving
    expect(phone.state.step).toBe('done')
    expect(relay.calls.map((c) => c.op)).not.toContain('approval/cancel')
    browser.dispose()
  })

  it('cancels the channel when the User says No', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    await phone.decline()
    expect(phone.state).toEqual({ step: 'declined', hello: HELLO })
    expect(relay.channels.get(phone.channelId!)?.status).toBe('cancelled')
    browser.dispose()
  })

  it('notices the browser leaving', async () => {
    const { browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    await browser.cancel()
    await phone.poll()
    expect(phone.state).toEqual({ step: 'failed', reason: 'cancelled' })
  })

  it('does not send once the claim has expired', async () => {
    const { relay, browser, phoneFor } = setup()
    await browser.start()
    const phone = phoneFor(linkOf(browser))
    await phone.claim()
    browser.dispose()
    vi.setSystemTime(Date.now() + CLAIMED_MS)
    await phone.approve()
    expect(phone.state).toEqual({ step: 'failed', reason: 'expired' })
    expect(relay.calls.some((c) => c.op === 'approval/send')).toBe(false)
  })
})
