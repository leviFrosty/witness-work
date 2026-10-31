import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { fromB64u, fromUtf8, toB64u, utf8 } from '@/lib/bytes'
import { open, seal } from '@/lib/sealedBlob'
import {
  APPROVAL_LOCAL_ORIGINS,
  approvalOriginsFor,
  buildApprovalLink,
  createApprovalOffer,
  createBrowserToken,
  deriveApprovalClaimToken,
  deriveApprovalHelloKey,
  deriveApprovalKeys,
  isApprovalLink,
  openApprovalHello,
  openApprovalKey,
  parseApprovalLink,
  sealApprovalHello,
  sealApprovalKey,
} from '@/lib/serverAccount/approval'
import { createHandoffKeyPair } from '@/lib/serverAccount/handoff'

let counter = 0
/** Distinct, repeatable bytes per call. */
const random = (length: number) => {
  counter += 1
  return Uint8Array.from({ length }, (_, i) => (counter * 31 + i * 7) & 0xff)
}

const PROD = ['https://app.witnesswork.app', 'https://beta.app.witnesswork.app']

const hkdf = (ikm: Uint8Array, info: string, length: number) =>
  new Uint8Array(
    crypto.hkdfSync('sha256', ikm, new Uint8Array(0), info, length)
  )

describe('approval origins', () => {
  it.each([
    'https://api.witnesswork.app',
    'https://api.witnesswork.app/',
    'https://API.witnesswork.app',
    'https://api.witnesswork.app:443',
    'https://ww-proxy.leviwilkerson.com',
  ])(
    'are the production web app for the production API at %s',
    (apiBaseUrl) => {
      expect(approvalOriginsFor({ apiBaseUrl, dev: false })).toEqual(PROD)
      expect(approvalOriginsFor({ apiBaseUrl, dev: true })).toEqual(PROD)
    }
  )

  it('are the dev web app for the dev API', () => {
    expect(
      approvalOriginsFor({
        apiBaseUrl: 'https://api-dev.witnesswork.app',
        dev: true,
      })
    ).toEqual(['https://app-dev.witnesswork.app', ...APPROVAL_LOCAL_ORIGINS])
  })

  it('are the dev web app for any other API', () => {
    expect(
      approvalOriginsFor({ apiBaseUrl: 'https://dev.example', dev: false })
    ).toEqual(['https://app-dev.witnesswork.app'])
  })

  it('never add the localhost origins for the production API', () => {
    expect(
      approvalOriginsFor({
        apiBaseUrl: 'https://ww-proxy.leviwilkerson.com',
        dev: true,
      })
    ).toEqual(PROD)
  })

  it('add the localhost origins in dev builds', () => {
    expect(
      approvalOriginsFor({ apiBaseUrl: 'http://localhost:8787', dev: true })
    ).toEqual(['https://app-dev.witnesswork.app', ...APPROVAL_LOCAL_ORIGINS])
    expect(APPROVAL_LOCAL_ORIGINS).toContain('http://localhost:8081')
  })
})

describe('approval link', () => {
  const { offer } = createApprovalOffer(random)

  it('round-trips through the QR code', () => {
    const link = buildApprovalLink(offer, 'https://app.witnesswork.app')
    expect(link).toMatch(
      /^https:\/\/app\.witnesswork\.app\/approve#1[A-Za-z0-9_-]{86}$/
    )
    expect(parseApprovalLink(link, PROD)).toEqual({ ok: true, offer })
  })

  it('carries channelId ‖ browserPub ‖ secret', () => {
    const link = buildApprovalLink(offer, 'https://app.witnesswork.app')
    const raw = fromB64u(link.split('#1')[1])
    expect(toB64u(raw.subarray(0, 16))).toBe(offer.channelId)
    expect(toB64u(raw.subarray(16, 48))).toBe(offer.browserPub)
    expect(raw.subarray(48)).toEqual(offer.secret)
  })

  it('accepts a localhost origin only when allowed', () => {
    const link = buildApprovalLink(offer, 'http://localhost:8081')
    expect(parseApprovalLink(link, APPROVAL_LOCAL_ORIGINS)).toEqual({
      ok: true,
      offer,
    })
    expect(parseApprovalLink(link, PROD)).toEqual({
      ok: false,
      problem: 'wrongHost',
    })
  })

  it('refuses other hosts', () => {
    for (const origin of [
      'https://evil.example',
      'https://app.witnesswork.app.evil.example',
      'https://witnesswork.app',
      'http://app.witnesswork.app',
      'https://app-dev.witnesswork.app',
    ])
      expect(parseApprovalLink(buildApprovalLink(offer, origin), PROD)).toEqual(
        { ok: false, problem: 'wrongHost' }
      )
  })

  it('ignores case in the host and tolerates spaces around it', () => {
    const link = buildApprovalLink(offer, 'https://app.witnesswork.app')
    expect(
      parseApprovalLink(
        `  ${link.replace('app.witnesswork.app', 'App.WitnessWork.app')} `,
        PROD
      )
    ).toEqual({ ok: true, offer })
  })

  it('says which part is wrong', () => {
    const link = buildApprovalLink(offer, 'https://app.witnesswork.app')
    const body = link.split('#1')[1]
    const base = 'https://app.witnesswork.app/approve#'
    expect(parseApprovalLink('hello', PROD)).toEqual({
      ok: false,
      problem: 'notApproval',
    })
    expect(
      parseApprovalLink('https://ww-proxy.leviwilkerson.com/h#1abc', PROD)
    ).toEqual({ ok: false, problem: 'notApproval' })
    expect(parseApprovalLink(`${base}2${body}`, PROD)).toEqual({
      ok: false,
      problem: 'version',
    })
    expect(
      parseApprovalLink('https://app.witnesswork.app/approve', PROD)
    ).toEqual({ ok: false, problem: 'damaged' })
    expect(parseApprovalLink(`${base}1${body.slice(1)}`, PROD)).toEqual({
      ok: false,
      problem: 'damaged',
    })
    expect(parseApprovalLink(`${base}1${body}AA`, PROD)).toEqual({
      ok: false,
      problem: 'damaged',
    })
    expect(parseApprovalLink(`${base}1${body.slice(0, -1)}!`, PROD)).toEqual({
      ok: false,
      problem: 'damaged',
    })
    expect(parseApprovalLink(`${base}x${body}`, PROD)).toEqual({
      ok: false,
      problem: 'damaged',
    })
  })

  it('reads only version 1, even when the body starts with a digit', () => {
    // 0xd4 starts the b64u body with "1".
    const channelId = toB64u(
      Uint8Array.from({ length: 16 }, (_, i) => 0xd4 - i)
    )
    const digit = { ...offer, channelId }
    const link = buildApprovalLink(digit, 'https://app.witnesswork.app')
    const body = link.split('#1')[1]
    expect(body[0]).toBe('1')
    expect(parseApprovalLink(link, PROD)).toEqual({ ok: true, offer: digit })
    const base = 'https://app.witnesswork.app/approve#'
    const other = link.split('#1')[1].replace(/^1/, 'A')
    for (const version of ['12', '10', '01', '2'])
      expect(parseApprovalLink(`${base}${version}${other}`, PROD)).toEqual({
        ok: false,
        problem: 'version',
      })
  })

  it("takes only the contract's exact form", () => {
    const link = buildApprovalLink(offer, 'https://app.witnesswork.app')
    const fragment = link.split('#')[1]
    for (const text of [
      `https://app.witnesswork.app/approve/#${fragment}`,
      `https://app.witnesswork.app/approve?x=1#${fragment}`,
      `https://app.witnesswork.app/approve?#${fragment}`,
      `https://app.witnesswork.app/approve/more#${fragment}`,
      `https://app.witnesswork.app/web/approve#${fragment}`,
      `https://app.witnesswork.app/Approve#${fragment}`,
    ])
      expect(parseApprovalLink(text, PROD)).toEqual({
        ok: false,
        problem: 'notApproval',
      })
    expect(isApprovalLink(link)).toBe(true)
    expect(
      isApprovalLink(`https://app.witnesswork.app/approve/#${fragment}`)
    ).toBe(false)
    for (const host of [
      'https://app.witnesswork.app:443',
      'https://user@app.witnesswork.app',
    ])
      expect(parseApprovalLink(`${host}/approve#${fragment}`, PROD)).toEqual({
        ok: false,
        problem: 'wrongHost',
      })
  })

  it('refuses an all-zero browser key', () => {
    const zero = { ...offer, browserPub: toB64u(new Uint8Array(32)) }
    expect(
      parseApprovalLink(
        buildApprovalLink(zero, 'https://app.witnesswork.app'),
        PROD
      )
    ).toEqual({ ok: false, problem: 'damaged' })
  })
})

describe('approval keys', () => {
  const { offer, keyPair: browser } = createApprovalOffer(random)
  const phone = createHandoffKeyPair(random)
  const browserSide = deriveApprovalKeys({
    privateKey: browser.privateKey,
    peerPublicKey: phone.publicKey,
    secret: offer.secret,
    channelId: offer.channelId,
    browserPub: offer.browserPub,
    phonePub: phone.publicKey,
  })
  const phoneSide = deriveApprovalKeys({
    privateKey: phone.privateKey,
    peerPublicKey: offer.browserPub,
    secret: offer.secret,
    channelId: offer.channelId,
    browserPub: offer.browserPub,
    phonePub: phone.publicKey,
  })

  it('derives the claim token and hello key from the secret', () => {
    expect(
      fromB64u(deriveApprovalClaimToken(offer.secret, offer.channelId))
    ).toEqual(
      hkdf(offer.secret, `ww-account/v1/approval/claim\n${offer.channelId}`, 16)
    )
    expect(deriveApprovalHelloKey(offer.secret, offer.channelId)).toEqual(
      hkdf(offer.secret, `ww-account/v1/approval/hello\n${offer.channelId}`, 32)
    )
  })

  it('makes a browser token and its verifier', () => {
    const { browserToken, browserVerifier } = createBrowserToken(random)
    expect(fromB64u(browserToken)).toHaveLength(16)
    expect(browserVerifier).toBe(
      toB64u(
        new Uint8Array(
          crypto.createHash('sha256').update(fromB64u(browserToken)).digest()
        )
      )
    )
  })

  it('gives both sides the same key and code', () => {
    expect(browserSide.keyKey).toEqual(phoneSide.keyKey)
    expect(browserSide.code).toBe(phoneSide.code)
    expect(browserSide.code).toMatch(/^\d{6}$/)
  })

  it('derives the key and code from prk and the transcript', () => {
    const shared = crypto.diffieHellman({
      privateKey: crypto.createPrivateKey({
        key: Buffer.concat([
          Buffer.from('302e020100300506032b656e04220420', 'hex'),
          Buffer.from(phone.privateKey),
        ]),
        format: 'der',
        type: 'pkcs8',
      }),
      publicKey: crypto.createPublicKey({
        key: Buffer.concat([
          Buffer.from('302a300506032b656e032100', 'hex'),
          Buffer.from(fromB64u(offer.browserPub)),
        ]),
        format: 'der',
        type: 'spki',
      }),
    })
    const prk = crypto
      .createHmac('sha256', Buffer.from(offer.secret))
      .update(shared)
      .digest()
    const transcript = `${offer.channelId}\n${offer.browserPub}\n${phone.publicKey}`
    const expand = (info: string, length: number) =>
      crypto
        .createHmac('sha256', prk)
        .update(Buffer.concat([Buffer.from(info), Buffer.from([1])]))
        .digest()
        .subarray(0, length)
    expect(Buffer.from(phoneSide.keyKey)).toEqual(
      expand(`ww-account/v1/approval/key\n${transcript}`, 32)
    )
    const code = expand(`ww-account/v1/approval/code\n${transcript}`, 4)
    expect(phoneSide.code).toBe(
      String(code.readUInt32BE(0) % 1_000_000).padStart(6, '0')
    )
  })

  it('seals the hello to the phone', () => {
    const helloKey = deriveApprovalHelloKey(offer.secret, offer.channelId)
    const sealed = sealApprovalHello(
      helloKey,
      offer.channelId,
      { browser: ' Chrome ', system: 'macOS', appVersion: '3.1.0' },
      random
    )
    expect(
      JSON.parse(
        fromUtf8(
          open(
            helloKey,
            sealed,
            `ww-account/v1/approval/hello\n${offer.channelId}`
          )
        )
      )
    ).toEqual({ browser: 'Chrome', system: 'macOS', appVersion: '3.1.0' })
    expect(openApprovalHello(helloKey, offer.channelId, sealed)).toEqual({
      browser: 'Chrome',
      system: 'macOS',
      appVersion: '3.1.0',
    })
    expect(() => openApprovalHello(helloKey, 'B'.repeat(22), sealed)).toThrow()
  })

  it('cuts long hello strings', () => {
    const helloKey = deriveApprovalHelloKey(offer.secret, offer.channelId)
    const sealed = sealApprovalHello(
      helloKey,
      offer.channelId,
      { browser: 'b'.repeat(200), system: 's'.repeat(200), appVersion: '1' },
      random
    )
    expect(sealed.length).toBeLessThanOrEqual(1024)
    const hello = openApprovalHello(helloKey, offer.channelId, sealed)
    expect(hello.browser).toHaveLength(64)
    expect(hello.system).toHaveLength(64)
  })

  it('drops control and format characters a browser could draw lines with', () => {
    const helloKey = deriveApprovalHelloKey(offer.secret, offer.channelId)
    const sealed = seal(
      helloKey,
      utf8(
        JSON.stringify({
          browser: 'Chrome\n\nNear Springfield\u202e\u0000',
          system: ' mac\tOS ',
          appVersion: '3.1.0\u200f',
        })
      ),
      `ww-account/v1/approval/hello\n${offer.channelId}`,
      random(12)
    )
    expect(openApprovalHello(helloKey, offer.channelId, sealed)).toEqual({
      browser: 'Chrome Near Springfield',
      system: 'mac OS',
      appVersion: '3.1.0',
    })
  })

  it('seals the account key to the browser', () => {
    const accountKey = random(32)
    const accountId = toB64u(random(16))
    const sealed = sealApprovalKey(
      phoneSide.keyKey,
      offer.channelId,
      { accountKey, accountId, deviceName: "Sam's iPhone" },
      random
    )
    expect(sealed.length).toBeLessThanOrEqual(1024)
    const plaintext = JSON.parse(
      fromUtf8(
        open(
          phoneSide.keyKey,
          sealed,
          `ww-account/v1/approval/key\n${offer.channelId}`
        )
      )
    )
    expect(plaintext).toEqual({
      v: 1,
      accountKey: toB64u(accountKey),
      accountId,
      deviceName: "Sam's iPhone",
    })
    expect(
      openApprovalKey(browserSide.keyKey, offer.channelId, sealed)
    ).toEqual({
      accountKey,
      accountId,
      deviceName: "Sam's iPhone",
    })
    expect(() => openApprovalKey(random(32), offer.channelId, sealed)).toThrow()
  })
})
