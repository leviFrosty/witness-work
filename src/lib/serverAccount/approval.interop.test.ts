import { randomBytes as nodeRandomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { toB64u } from '@/lib/bytes'
import { HttpError, request } from '@/lib/http/request'
import { sendApprovalKey } from '@/lib/serverAccount/approvalClient'
import {
  type BrowserApprovalState,
  createBrowserApproval,
  createPhoneApproval,
} from '@/lib/serverAccount/approvalSession'
import {
  interopAccount,
  interopEnabled,
  interopRelayUrl,
} from '@/lib/serverAccount/testing/interopSessions'

vi.mock('@/lib/logger', () => import('@/__tests__/mocks/logger'))

/**
 * Opt-in contract check of approving a browser from a phone against a real
 * worker (see `interopSessions`). The phone's session is the dev bypass's.
 * Skipped by default.
 */
const baseUrl = interopRelayUrl!
const random = (length: number) => new Uint8Array(nodeRandomBytes(length))
const ORIGIN = 'http://localhost:8081'
const HELLO = { browser: 'Chrome', system: 'macOS', appVersion: '3.0.0' }

const deps = { baseUrl, now: Date.now, randomBytes: random }

function browser() {
  return createBrowserApproval({ ...deps, origin: ORIGIN, hello: HELLO })
}

async function showing(approval: ReturnType<typeof browser>) {
  await approval.start()
  if (approval.state.step !== 'showing') throw new Error(approval.state.step)
  return approval.state.link
}

async function phone(link: string) {
  const account = await interopAccount(random)
  return {
    ...account,
    approval: createPhoneApproval(
      link,
      {
        accountKey: account.accountKey,
        accountId: account.accountId,
        deviceName: 'Interop Phone',
        authorize: account.bearer.authorize,
      },
      { ...deps, origins: [ORIGIN] }
    ),
  }
}

const code = async (run: () => Promise<unknown>) => {
  try {
    await run()
    return 'ok'
  } catch (error) {
    return error instanceof HttpError
      ? `${error.status} ${error.serverCode}`
      : String(error)
  }
}

describe.skipIf(!interopEnabled)('approval against a real worker', () => {
  it('hands the account key from a phone to a browser', async () => {
    const page = browser()
    const signedIn = await phone(await showing(page))
    await signedIn.approval.claim()
    expect(signedIn.approval.state).toMatchObject({
      step: 'confirm',
      hello: HELLO,
    })
    await vi.waitFor(() => expect(page.state.step).toBe('claimed'), {
      timeout: 10_000,
    })
    if (
      page.state.step !== 'claimed' ||
      signedIn.approval.state.step !== 'confirm'
    )
      return
    expect(page.state.code).toBe(signedIn.approval.state.code)

    await signedIn.approval.approve()
    expect(signedIn.approval.state.step).toBe('done')
    await vi.waitFor(() => expect(page.state.step).toBe('received'), {
      timeout: 10_000,
    })
    const received = page.state as BrowserApprovalState
    if (received.step !== 'received') return
    expect(toB64u(received.received.accountKey)).toBe(
      toB64u(signedIn.accountKey)
    )
    expect(received.received).toMatchObject({
      accountId: signedIn.accountId,
      deviceName: 'Interop Phone',
      ticket: expect.any(String),
    })
    await page.finish()
    expect((page.state as BrowserApprovalState).step).toBe('done')
    expect(page.debug().events.at(-1)).toMatchObject({
      op: 'approval/done',
      outcome: 'ok',
    })
  })

  it('lets only the first phone claim a code', async () => {
    const page = browser()
    const link = await showing(page)
    const first = await phone(link)
    await first.approval.claim()
    const second = await phone(link)
    await second.approval.claim()
    expect(second.approval.state).toEqual({ step: 'failed', reason: 'used' })
    await first.approval.decline()
    await vi.waitFor(
      () => expect(page.state).toEqual({ step: 'failed', reason: 'cancelled' }),
      { timeout: 10_000 }
    )
  })

  it('answers the documented codes', async () => {
    const page = browser()
    const link = await showing(page)
    const channelId = page.debug().channels[0]
    const plain = (op: string, json: object) =>
      code(() =>
        request({
          url: `${baseUrl}/accounts/v1/${op}`,
          json,
          timeoutMs: 10_000,
        })
      )
    // A wrong browser token is bad_signature.
    expect(
      await plain('approval/receive', {
        channelId,
        browserToken: toB64u(random(16)),
      })
    ).toBe('401 bad_signature')
    // An unknown channel is not_found.
    expect(
      await plain('approval/status', {
        channelId: toB64u(random(16)),
        browserToken: toB64u(random(16)),
      })
    ).toBe('404 not_found')
    // `send` before any claim: `conflict` unless claimed, and no session has
    // claimed it yet, so the contract allows either.
    const signedIn = await phone(link)
    expect(
      await code(() =>
        sendApprovalKey({ channelId, key: toB64u(random(64)) }, signedIn.bearer)
      )
    ).toMatch(/^(409 conflict|403 forbidden)$/)
    await signedIn.approval.cancel()
    await page.cancel()
  })
})
