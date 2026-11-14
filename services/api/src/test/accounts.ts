import type { Hono } from 'hono'
import { accountSignedMessage, type AccountsOp } from '../accounts/contracts'
import type { Environment } from '../types'
import { SigningKey, b64u, randomId } from './buddiesClient'
import { TEST_DEV_BYPASS, type ApiResponse } from './buddies'

/**
 * Client helpers for account tests: self-signed envelopes, bearer headers,
 * and sessions opened with the harness's dev bypass.
 */

const encoder = new TextEncoder()

/** A self-signed account envelope for `op`; `signer` defaults to `key`. */
export const accountEnvelope = async (
  op: AccountsOp,
  key: SigningKey,
  fields: Record<string, unknown> = {},
  signer: SigningKey = key
) => {
  const bytes = encoder.encode(
    JSON.stringify({
      accountPub: key.publicKey,
      ts: Date.now(),
      nonce: randomId(),
      ...fields,
    })
  )
  return {
    payload: b64u(bytes),
    signature: b64u(await signer.sign(accountSignedMessage(op, bytes))),
  }
}

export const bearer = (accessToken: string): Record<string, string> => ({
  authorization: `Bearer ${accessToken}`,
})

export interface TestSession {
  key: SigningKey
  accountId: string
  sessionId: string
  accessToken: string
  refreshToken: string
  accessExpiresAt: number
  sessionExpiresAt: number
}

let ipCounter = 0
/** A fresh caller IP so per-caller edge limits never couple tests. */
export const nextTestIp = () => `198.19.${(++ipCounter >> 8) & 255}.${ipCounter & 255}`

/** Sends a JSON request to an accounts app and reads the JSON answer. */
export const requestJson = async (
  app: Hono<never>,
  env: Environment,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<ApiResponse & { headers: Headers }> => {
  const response = await app.request(
    path,
    {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': nextTestIp(),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env
  )
  const text = await response.text()
  let parsed: unknown = text
  try {
    parsed = JSON.parse(text)
  } catch {
    // Raw bytes (backup/get) or empty.
  }
  return { status: response.status, headers: response.headers, body: parsed }
}

/** POSTs JSON to an accounts app and reads the JSON answer. */
export const postJson = (
  app: Hono<never>,
  env: Environment,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) => requestJson(app, env, 'POST', path, body, headers)

/**
 * Opens a session (`POST /sessions` on the accounts routes) with the dev
 * bypass in place of attestation.
 */
export const openTestSession = async (
  app: Hono<never>,
  env: Environment,
  key?: SigningKey,
  fields: Record<string, unknown> = {}
): Promise<TestSession> => {
  const signingKey = key ?? (await SigningKey.generate())
  const response = await postJson(
    app,
    env,
    '/sessions',
    await accountEnvelope('session/open', signingKey, fields),
    { 'x-ww-dev-bypass': TEST_DEV_BYPASS }
  )
  if (response.status !== 201)
    throw new Error(
      `opening a session failed: ${response.status} ${JSON.stringify(response.body)}`
    )
  return { key: signingKey, ...response.body }
}

/**
 * Mints a browser live socket ticket (`POST /live/ticket` on the accounts
 * routes) with the session's access token.
 */
export const liveTicket = async (
  app: Hono<never>,
  env: Environment,
  session: Pick<TestSession, 'accessToken'>,
  socket: 'sync' | 'buddies',
  id: string
): Promise<string> => {
  const response = await postJson(
    app,
    env,
    '/live/ticket',
    { socket, id },
    bearer(session.accessToken)
  )
  if (response.status !== 200)
    throw new Error(`live/ticket answered ${response.status}`)
  return (response.body as { ticket: string }).ticket
}
