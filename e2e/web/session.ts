import { randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import type { BrowserContext, Page } from '@playwright/test'

/**
 * A signed-in browser for the web smoke tests: an account key and a session,
 * stored as the app stores them after a passkey sign-in (sealed under a
 * non-extractable key in `witnesswork-keys`, docs/web-storage.md), and ww-api's
 * session refresh answered here. Every token is made up; nothing reaches a real
 * service.
 */

export const TEST_ACCOUNT_ID = 'acct_web_smoke_test'
export const TEST_ACCESS_TOKEN = 'web-smoke-access-token'

const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

/** The account key's public key, as `deriveAccountSigningKey` makes it. */
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

/**
 * Writes the account key, the session and the data's owner into the browser's
 * key store. Run it on a page of the app's origin while no tab of the app is
 * open (`openBlankOnOrigin`).
 */
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
      const wrap = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      )
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

/** Ww-api's session refresh, for the seeded session, at `apiOrigin`. */
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

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
}
