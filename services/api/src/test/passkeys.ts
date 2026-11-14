import { accountSignedMessage, type AccountsOp } from '../accounts/contracts'
import { SigningKey, b64u, randomId } from './buddiesClient'
import { SoftPasskey, type CeremonyOptions, type PasskeyAlgorithm } from './webauthn'

/**
 * A passkey client for tests, over any transport (`send`): the in-process
 * accounts app or a running worker. Paths are relative to `/accounts/v1`.
 */

export interface Reply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  headers?: Headers
}

export type Send = (
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) => Promise<Reply>

const encoder = new TextEncoder()

/** A self-signed account envelope, with the payload fields as given. */
export const signedEnvelope = async (
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

export const authorization = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
})

export interface SessionLike {
  key: SigningKey
  accountId: string
  sessionId: string
  accessToken: string
  refreshToken: string
}

export class PasskeyClient {
  constructor(private readonly send: Send) {}

  registerOptions(session: SessionLike, body: Record<string, unknown> = {}) {
    return this.send(
      'POST',
      '/passkeys/register/options',
      body,
      authorization(session.accessToken)
    )
  }

  async add(
    session: SessionLike,
    fields: Record<string, unknown>,
    signer?: SigningKey
  ) {
    return this.send(
      'POST',
      '/passkeys',
      await signedEnvelope('passkey/add', session.key, fields, signer),
      authorization(session.accessToken)
    )
  }

  /** register/options, a new soft passkey, and `POST /passkeys`. */
  async register(
    session: SessionLike,
    {
      algorithm = 'ES256',
      rpId,
      ceremony = {},
      extra = {},
      synced = true,
    }: {
      algorithm?: PasskeyAlgorithm
      rpId?: string
      ceremony?: CeremonyOptions
      extra?: Record<string, unknown>
      synced?: boolean
    } = {}
  ) {
    const options = await this.registerOptions(
      session,
      rpId ? { rpId } : {}
    )
    if (options.status !== 200)
      throw new Error(`register/options: ${options.status} ${JSON.stringify(options.body)}`)
    const passkey = await SoftPasskey.create(
      algorithm,
      options.body.options.rp.id,
      options.body.userHandle,
      { synced }
    )
    const response = await passkey.register(options.body.options, ceremony)
    const added = await this.add(session, {
      challengeToken: options.body.challengeToken,
      response,
      ...extra,
    })
    return { passkey, options, response, added }
  }

  challenge(body: Record<string, unknown>, accessToken?: string) {
    return this.send(
      'POST',
      '/passkeys/challenge',
      body,
      accessToken ? authorization(accessToken) : {}
    )
  }

  assertWith(body: Record<string, unknown>, accessToken?: string) {
    return this.send(
      'POST',
      '/passkeys/assert',
      body,
      accessToken ? authorization(accessToken) : {}
    )
  }

  /** A sign-in: challenge, then the passkey's assertion. */
  async signIn(
    passkey: SoftPasskey,
    { rpId, ceremony = {} }: { rpId?: string; ceremony?: CeremonyOptions } = {}
  ) {
    const challenge = await this.challenge({
      purpose: 'sign-in',
      ...(rpId ? { rpId } : {}),
    })
    if (challenge.status !== 200)
      throw new Error(`challenge: ${challenge.status} ${JSON.stringify(challenge.body)}`)
    const response = await passkey.assert(challenge.body.options, ceremony)
    const assert = await this.assertWith({
      challengeToken: challenge.body.challengeToken,
      response,
    })
    return { challenge, response, assert }
  }

  /** A step-up for the session: challenge (Bearer), then the assertion. */
  async stepUp(
    session: SessionLike,
    passkey: SoftPasskey,
    { rpId, ceremony = {} }: { rpId?: string; ceremony?: CeremonyOptions } = {}
  ) {
    const challenge = await this.challenge(
      { purpose: 'step-up', ...(rpId ? { rpId } : {}) },
      session.accessToken
    )
    if (challenge.status !== 200)
      throw new Error(`step-up challenge: ${challenge.status} ${JSON.stringify(challenge.body)}`)
    const response = await passkey.assert(challenge.body.options, ceremony)
    const assert = await this.assertWith(
      { challengeToken: challenge.body.challengeToken, response },
      session.accessToken
    )
    return { challenge, response, assert }
  }

  /** `POST /sessions` with a ticket; returns the envelope too, to repeat it. */
  async openWeb(
    key: SigningKey,
    ticket: unknown,
    fields: Record<string, unknown> = {}
  ) {
    const envelope = await signedEnvelope('session/open', key, {
      ticket,
      ...fields,
    })
    return { envelope, reply: await this.send('POST', '/sessions', envelope) }
  }

  async wrap(session: SessionLike, fields: Record<string, unknown>) {
    return this.send(
      'POST',
      '/passkeys/wrap',
      await signedEnvelope('passkey/wrap', session.key, fields),
      authorization(session.accessToken)
    )
  }

  list(session: SessionLike) {
    return this.send('GET', '/passkeys', undefined, authorization(session.accessToken))
  }

  signupOptions(body: Record<string, unknown>, headers: Record<string, string> = {}) {
    return this.send('POST', '/web/signup/options', body, headers)
  }

  async signupWith(
    key: SigningKey,
    fields: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) {
    return this.send('POST', '/web/signup', await signedEnvelope('web/signup', key, fields), headers)
  }

  /** A web sign-up: options (Turnstile), a new soft passkey, and `POST /web/signup`. */
  async signUp(
    key: SigningKey,
    {
      turnstileToken = 'turnstile-pass',
      rpId,
      algorithm = 'ES256',
      ceremony = {},
      extra = {},
      headers = {},
    }: {
      turnstileToken?: string
      rpId?: string
      algorithm?: PasskeyAlgorithm
      ceremony?: CeremonyOptions
      extra?: Record<string, unknown>
      headers?: Record<string, string>
    } = {}
  ) {
    const options = await this.signupOptions(
      { turnstileToken, ...(rpId ? { rpId } : {}) },
      headers
    )
    if (options.status !== 200)
      throw new Error(`web/signup/options: ${options.status} ${JSON.stringify(options.body)}`)
    const passkey = await SoftPasskey.create(
      algorithm,
      options.body.options.rp.id,
      options.body.userHandle
    )
    const response = await passkey.register(options.body.options, ceremony)
    const signup = await this.signupWith(
      key,
      { challengeToken: options.body.challengeToken, response, ...extra },
      headers
    )
    return { passkey, options, response, signup }
  }

  async recovery(
    key: SigningKey,
    turnstileToken: unknown = 'turnstile-pass',
    headers: Record<string, string> = {}
  ) {
    return this.send(
      'POST',
      '/web/recovery',
      await signedEnvelope('web/recovery', key, { turnstileToken }),
      headers
    )
  }

  async remove(session: SessionLike, credentialId: string) {
    return this.send(
      'POST',
      '/passkeys/remove',
      await signedEnvelope('passkey/remove', session.key, { credentialId }),
      authorization(session.accessToken)
    )
  }
}
