import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { BrowserContext, Page, Request } from '@playwright/test'

export const TEST_ACCOUNT_ID = 'acct_web_smoke_test'
export const TEST_ACCESS_TOKEN = 'web-smoke-access-token'

const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

const accountPub = (accountKey: Uint8Array) =>
  b64u(
    ed25519.getPublicKey(
      hkdf(
        sha256,
        accountKey,
        new Uint8Array(0),
        new TextEncoder().encode('ww-account/v1/sign'),
        32
      )
    )
  )

export async function seedSession(page: Page) {
  const accountKey = new Uint8Array(randomBytes(32))
  const session = JSON.stringify({
    v: 1,
    accountPub: accountPub(accountKey),
    accountId: TEST_ACCOUNT_ID,
    status: 'active',
    sessionId: 'sess_web_smoke_test',
    refreshToken: 'web-smoke-refresh-token',
    sessionExpiresAt: Date.now() + 30 * 24 * 60 * 60_000,
  })
  await page.evaluate(
    async ([key, session, accountId]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('witnesswork-keys', 1)
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('kv'))
            request.result.createObjectStore('kv')
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const existing = await new Promise<CryptoKey | undefined>(
        (resolve, reject) => {
          const get = db.transaction('kv').objectStore('kv').get('wrap-key')
          get.onsuccess = () => resolve(get.result as CryptoKey | undefined)
          get.onerror = () => reject(get.error)
        }
      )
      const wrap =
        existing ??
        (await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        ))
      const seal = async (name: string, value: Uint8Array<ArrayBuffer>) => {
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const data = await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv,
            additionalData: new TextEncoder().encode(
              `ww-web/v1/sealed\n${name}`
            ),
          },
          wrap,
          value
        )
        return { v: 1, iv, data }
      }
      const entries: [string, unknown][] = [
        ['wrap-key', wrap],
        ['sealed:account-key', await seal('account-key', new Uint8Array(key))],
        [
          'sealed:session',
          await seal('session', new TextEncoder().encode(session)),
        ],
        ['data-owner', accountId],
      ]
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite')
        for (const [name, value] of entries)
          tx.objectStore('kv').put(value, name)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    [Array.from(accountKey), session, TEST_ACCOUNT_ID] as const
  )
}

export async function forgetSession(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('witnesswork-keys', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction('kv', 'readwrite')
          tx.objectStore('kv').delete('sealed:account-key')
          tx.objectStore('kv').delete('sealed:session')
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      })
  )
}

export async function announceSignIn(page: Page) {
  await page.evaluate(() => {
    const channel = new BroadcastChannel('ww-session')
    channel.postMessage({ type: 'signedIn', sessionId: 'sess_web_smoke_test' })
    channel.close()
  })
}

export async function answerSessionRefresh(
  context: BrowserContext,
  apiOrigin: string
) {
  let count = 0
  await context.route(`${apiOrigin}/accounts/v1/sessions/refresh`, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          status: 200,
          headers: cors,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            accessToken: TEST_ACCESS_TOKEN,
            accessExpiresAt: Date.now() + 15 * 60_000,
            refreshToken: `web-smoke-refresh-token-${++count}`,
            sessionExpiresAt: Date.now() + 30 * 24 * 60 * 60_000,
          }),
        })
  )
}

export const CORS_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  'If-Match',
  'X-WW-Slot-Id',
  'X-WW-Reseal',
  'X-WW-Payload',
  'X-WW-Photo-Name',
  'X-WW-Photo-Meta',
  'X-WW-Created-At',
  'X-Buddies-Payload',
  'X-Buddies-Signature',
  'X-Buddies-S',
  'X-Buddies-Client',
  'X-Upload-Content-Type',
].join(', ')

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
  'Access-Control-Allow-Methods': '*',
}

export async function corsFor(request: Request) {
  return {
    ...cors,
    'Access-Control-Allow-Headers':
      (await request.headerValue('access-control-request-headers')) ?? '*',
  }
}
