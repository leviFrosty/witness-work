import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { BrowserContext, Dialog, Page, Request } from '@playwright/test'
import {
  expect,
  openBlankOnOrigin,
  profile,
  readStoreRow,
  strings,
  test,
  writeStoreRow,
} from './fixtures'
import { announceSignIn, corsFor, forgetSession, seedSession } from './session'

/**
 * Contact share and Buddies invite links opened on the web (docs/app-links.md
 * "Without the app"): "Continue on the web" on a link page opens `/contacts#…`
 * or `/buddies/invite#…`. Each spec checks the fragment left the address, the
 * tab's storage and every request leaving the page. Run through the Worker
 * (`E2E_WORKER=dev`), whose single-page fallback serves the routes.
 */

test.use({
  // A service worker's requests skip Playwright's routing in WebKit, so they
  // would reach the real API; offline.spec.ts covers the service worker.
  serviceWorkers: 'block',
  signedIn: true,
  // Buddies shows only for someone its flag was on for; flags don't load here.
  storeState: { buddies: { flagLastKnown: true } },
})

// The API answers as a service that's down, as the fixture's does, but names
// the headers a bearer request's preflight asks for: WebKit doesn't let `*`
// cover `Authorization`, and reports the refused preflight of a request a
// navigation cancels as a page error.
test.beforeEach(async ({ context }) => {
  await context.route(`${profile.apiOrigin}/**`, async (route) => {
    const request = route.request()
    if (request.url().endsWith('/accounts/v1/sessions/refresh'))
      return route.fallback()
    return route.fulfill({
      status: request.method() === 'OPTIONS' ? 204 : 503,
      headers: await corsFor(request),
    })
  })
})

const en = strings('en-US')
const b64u = (bytes: Buffer) => bytes.toString('base64url')

/** A contact share's fragment, as `buildContactShareLink` makes it. */
function contactPayload(name: string, share: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return b64u(
    gzipSync(
      JSON.stringify({
        type: 'witnesswork-contact',
        version: '1.0',
        exportedAt: now,
        contact: { id: randomUUID(), name, createdAt: now },
        ...share,
      })
    )
  )
}

/** A Buddies invite's fragment: version 1, then the secret. */
const inviteFragment = () => `1${b64u(randomBytes(16))}`

/** What every request the page sends off the app's origin carried. */
async function recordOutgoing(context: BrowserContext, baseURL: string) {
  const app = new URL(baseURL).host
  const sent: string[] = []
  await context.route(
    (url) => url.host !== app && url.protocol.startsWith('http'),
    async (route) => {
      const request = route.request()
      let body = request.postDataBuffer() ?? Buffer.alloc(0)
      try {
        if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body)
      } catch {
        // Kept as sent.
      }
      sent.push(`${request.url()}\n${body.toString('latin1')}`)
      await route.fallback()
    }
  )
  return sent
}

/**
 * The secret is nowhere the page keeps or shows it: not its address, title or
 * history state, `localStorage`, `sessionStorage`, the store database, or the
 * key store in the clear.
 */
async function expectKeptNowhere(page: Page, secret: string) {
  const found = await page.evaluate(async (secret) => {
    const read = (name: string) =>
      new Promise<string>((resolve) => {
        const request = indexedDB.open(name)
        request.onerror = () => resolve('')
        request.onsuccess = () => {
          const db = request.result
          const names = [...db.objectStoreNames]
          if (!names.length) return resolve('')
          const tx = db.transaction(names)
          const parts: string[] = []
          const text = (value: unknown): string => {
            if (value instanceof ArrayBuffer)
              return String.fromCharCode(...new Uint8Array(value))
            if (ArrayBuffer.isView(value))
              return String.fromCharCode(
                ...new Uint8Array(
                  value.buffer,
                  value.byteOffset,
                  value.byteLength
                )
              )
            if (value && typeof value === 'object')
              return Object.values(value).map(text).join('\n')
            return String(value)
          }
          for (const store of names) {
            const all = tx.objectStore(store).getAll()
            all.onsuccess = () => parts.push(...all.result.map(text))
          }
          tx.oncomplete = () => {
            db.close()
            resolve(parts.join('\n'))
          }
        }
      })
    const places: Record<string, string> = {
      address: location.href,
      title: document.title,
      history: JSON.stringify(history.state),
      localStorage: JSON.stringify({ ...localStorage }),
      sessionStorage: JSON.stringify({ ...sessionStorage }),
      stores: await read('witnesswork-stores'),
      keys: await read('witnesswork-keys'),
    }
    return Object.keys(places).filter((place) => places[place].includes(secret))
  }, secret)
  expect(found, 'where the link’s secret was found').toEqual([])
}

/** Answers the next confirm dialog, and says what it asked. */
function answerDialog(page: Page, accept = true) {
  return new Promise<string>((resolve) => {
    page.once('dialog', (dialog: Dialog) => {
      resolve(dialog.message())
      void (accept ? dialog.accept() : dialog.dismiss())
    })
  })
}

const importQuestion = (name: string) =>
  en.importContactConfirm_description.replace('{{name}}', name)

/** Contacts saved in the store database, by name. */
async function savedContacts(page: Page): Promise<string[]> {
  const row = (await readStoreRow(page, 'mmkv.default', 'contacts')) as
    | string
    | undefined
  const contacts = row
    ? (JSON.parse(row).state.contacts as { name: string }[])
    : []
  return contacts.map((contact) => contact.name)
}

/** Ww-api's relay says an invite doesn't exist (anymore). */
async function answerInviteGone(context: BrowserContext) {
  const lookups: string[] = []
  await context.route(
    `${profile.apiOrigin}/buddies/v1/invite/fetch`,
    async (route) => {
      const request = route.request()
      const headers = await corsFor(request)
      if (request.method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers })
      lookups.push(request.postData() ?? '')
      return route.fulfill({
        status: 404,
        headers,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'not_found' }),
      })
    }
  )
  return lookups
}

/** API requests each page has in flight. */
const inFlight = new WeakMap<Page, Set<unknown>>()

test.beforeEach(({ context }) => {
  const track = (request: Request, done: boolean) => {
    const page = request.frame().page()
    if (!request.url().startsWith(profile.apiOrigin)) return
    const requests = inFlight.get(page) ?? new Set()
    inFlight.set(page, requests)
    if (done) requests.delete(request)
    else requests.add(request)
  }
  context.on('request', (request) => track(request, false))
  context.on('requestfinished', (request) => track(request, true))
  context.on('requestfailed', (request) => track(request, true))
})

/**
 * Waits until the page has had no API request in flight for three seconds,
 * before the test navigates a tab that runs the app: WebKit reports a request
 * the navigation cancels (the backup and sync the app sends once idle) as a
 * page error.
 */
async function afterLaunchRequests(page: Page) {
  let quietSince = Date.now()
  await expect
    .poll(
      () => {
        if ((inFlight.get(page)?.size ?? 0) > 0) quietSince = Date.now()
        return Date.now() - quietSince >= 3_000
      },
      { intervals: [100] }
    )
    .toBe(true)
}

/** Leaves the app for a blank page on its origin, so the next load is cold. */
async function closeApp(page: Page) {
  await afterLaunchRequests(page)
  await openBlankOnOrigin(page)
}

test.describe('a contact share link', () => {
  test('opens cold, imports once, and keeps no trace of its payload', async ({
    app,
    baseURL,
    shot,
  }) => {
    const sent = await recordOutgoing(app.context(), baseURL!)
    await closeApp(app)
    const name = 'Jordan Rivers'
    const payload = contactPayload(name)
    const asked = answerDialog(app)
    await app.goto(`/contacts#${payload}`)
    expect(await asked).toContain(importQuestion(name))
    await expect(app.getByText(name).first()).toBeVisible()
    await expect.poll(() => savedContacts(app)).toEqual([name])
    expect(new URL(app.url()).hash).toBe('')
    await shot('link-contact-imported')
    await expectKeptNowhere(app, payload)

    // Reloading the contact it opened imports nothing again.
    let askedAgain = false
    app.on('dialog', () => (askedAgain = true))
    await afterLaunchRequests(app)
    await app.reload()
    await expect(app.getByText(name).first()).toBeVisible()
    await app.waitForTimeout(2_000)
    expect(askedAgain).toBe(false)
    expect(await savedContacts(app)).toEqual([name])
    expect(sent.filter((request) => request.includes(payload))).toEqual([])
  })

  test('opens from the old host’s short path', async ({ app }) => {
    await closeApp(app)
    const name = 'Avery Stone'
    const asked = answerDialog(app, false)
    await app.goto(`/c#${contactPayload(name)}`)
    expect(await asked).toContain(importQuestion(name))
    // Declined: nothing saved.
    await expect(
      app.getByRole('button', { name: en.quickAction })
    ).toBeVisible()
    expect(await savedContacts(app)).toEqual([])
  })

  test('opens in a tab already open, on Home', async ({ app }) => {
    const name = 'Morgan Lee'
    const payload = contactPayload(name)
    const asked = answerDialog(app)
    await afterLaunchRequests(app)
    await app.goto(`/contacts#${payload}`)
    expect(await asked).toContain(importQuestion(name))
    await expect.poll(() => savedContacts(app)).toEqual([name])
    await expectKeptNowhere(app, payload)
  })

  test('opens after Use Here, in a new tab while another has the app', async ({
    app,
    context,
  }) => {
    const name = 'Riley Banks'
    const payload = contactPayload(name)
    // Use Here makes this tab stand down and reload.
    await afterLaunchRequests(app)
    const second = await context.newPage()
    await second.goto(`/contacts#${payload}`)
    await expect(second.getByText(en.webTab_useHere)).toBeVisible()
    expect(new URL(second.url()).hash).toBe('')
    const asked = answerDialog(second)
    await second.getByRole('button', { name: en.webTab_useHere }).click()
    expect(await asked).toContain(importQuestion(name))
    await expect.poll(() => savedContacts(second)).toEqual([name])
    await expectKeptNowhere(second, payload)
    // The first tab gave the app up.
    await expect(app.getByText(en.webTab_useHere)).toBeVisible()
    await second.close()
  })

  test('waits through signing in, across the reload it brings', async ({
    app,
    context,
  }) => {
    await closeApp(app)
    await forgetSession(app)
    const name = 'Casey Moore'
    const payload = contactPayload(name)
    await app.goto(`/contacts#${payload}`)
    await expect(app.getByText(en.webSignIn_title)).toBeVisible()
    expect(new URL(app.url()).hash).toBe('')
    // Sealed, never in the clear, while it waits.
    await expectKeptNowhere(app, payload)

    // Signing in, in another tab of this browser, reloads this one into the
    // account.
    const other = await context.newPage()
    await openBlankOnOrigin(other)
    await seedSession(other)
    const asked = answerDialog(app)
    await announceSignIn(other)
    expect(await asked).toContain(importQuestion(name))
    await expect.poll(() => savedContacts(app)).toEqual([name])
    await other.close()

    // Opened: a reload brings nothing back.
    let askedAgain = false
    app.on('dialog', () => (askedAgain = true))
    await afterLaunchRequests(app)
    await app.reload()
    await expect(app.getByText(name).first()).toBeVisible()
    await app.waitForTimeout(2_000)
    expect(askedAgain).toBe(false)
  })

  for (const [kind, fragment] of [
    ['malformed', 'not-a-contact_payload'],
    // Past the parser's 64 KiB limit; the web cuts it far shorter first.
    ['oversized', 'A'.repeat(70_000)],
    [
      'an unknown version',
      contactPayload('Sam Reed', { type: 'witnesswork-contact-v9' }),
    ],
  ] as const)
    test(`says a ${kind} link isn’t valid`, async ({ app, shot }) => {
      await closeApp(app)
      let asked = false
      app.on('dialog', () => (asked = true))
      await app.goto(`/contacts#${fragment}`)
      await expect(app.getByText(en.invalidContactLink)).toBeVisible()
      await expect(
        app.getByText(en.invalidContactLink_description)
      ).toBeVisible()
      expect(asked).toBe(false)
      expect(new URL(app.url()).hash).toBe('')
      if (kind === 'malformed') await shot('link-contact-invalid')
    })
})

test.describe('a Buddies invite link', () => {
  test('opens the pre-accept screen cold, keeping its secret out of the address', async ({
    app,
    baseURL,
    shot,
  }) => {
    const lookups = await answerInviteGone(app.context())
    const sent = await recordOutgoing(app.context(), baseURL!)
    await closeApp(app)
    const fragment = inviteFragment()
    const secret = fragment.slice(1)
    await app.goto(`/buddies/invite#${fragment}`)
    await expect(app.getByText(en.buddies_inviteUnavailable)).toBeVisible()
    await expect(
      app.getByText(en.buddies_title, { exact: true }).filter({ visible: true })
    ).toBeVisible()
    expect(lookups).toHaveLength(1)
    // Its path, and nothing of the link: React Navigation would otherwise
    // write the screen's params into the query.
    expect(new URL(app.url()).pathname).toBe('/buddies/invite')
    expect(new URL(app.url()).search).toBe('')
    expect(new URL(app.url()).hash).toBe('')
    await shot('link-invite-opened')
    await expectKeptNowhere(app, secret)
    // The relay gets the invite's id, never its secret.
    expect(sent.filter((request) => request.includes(secret))).toEqual([])

    // Reloading the screen opens Home: the link was opened once.
    await afterLaunchRequests(app)
    await app.reload()
    await expect(
      app.getByRole('button', { name: en.quickAction })
    ).toBeVisible()
    expect(new URL(app.url()).pathname).not.toBe('/buddies/invite')
    await app.waitForTimeout(2_000)
    expect(lookups).toHaveLength(1)
  })

  test('opens from the old host’s short path', async ({ app }) => {
    await answerInviteGone(app.context())
    await closeApp(app)
    await app.goto(`/b#${inviteFragment()}`)
    await expect(app.getByText(en.buddies_inviteUnavailable)).toBeVisible()
    expect(new URL(app.url()).search).toBe('')
  })

  test('opens a new invite in the tab showing one', async ({ app }) => {
    const lookups = await answerInviteGone(app.context())
    await afterLaunchRequests(app)
    await app.goto(`/buddies/invite#${inviteFragment()}`)
    await expect(app.getByText(en.buddies_inviteUnavailable)).toBeVisible()
    // The User pastes another invite into this tab's address bar.
    const next = inviteFragment()
    await app.evaluate((next) => (location.hash = next), next)
    await expect.poll(() => lookups.length).toBe(2)
    expect(new URL(app.url()).hash).toBe('')
    await expectKeptNowhere(app, next.slice(1))
  })

  for (const [kind, fragment] of [
    ['malformed', '1short'],
    ['an unknown version', `2${b64u(randomBytes(16))}`],
  ] as const)
    test(`says a ${kind} link isn’t valid`, async ({ app, shot }) => {
      const lookups = await answerInviteGone(app.context())
      await closeApp(app)
      await app.goto(`/buddies/invite#${fragment}`)
      await expect(app.getByText(en.buddies_inviteInvalid)).toBeVisible()
      expect(lookups).toEqual([])
      expect(new URL(app.url()).hash).toBe('')
      if (kind === 'malformed') await shot('link-invite-invalid')
    })
})

test.describe('behind App Lock', () => {
  // A virtual passkey unlocks it: Chromium only, and on `localhost`, since an
  // IP address can't be a passkey's RP ID.
  test.skip(
    ({ browserName, baseURL }) =>
      browserName !== 'chromium' || new URL(baseURL!).hostname !== 'localhost',
    'needs Chromium’s virtual authenticator on localhost'
  )

  const credentialId = randomBytes(16)

  test('waits until the app is unlocked', async ({ app }) => {
    const cdp = await app.context().newCDPSession(app)
    await cdp.send('WebAuthn.enable')
    const { authenticatorId } = await cdp.send(
      'WebAuthn.addVirtualAuthenticator',
      {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      }
    )
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    await cdp.send('WebAuthn.addCredential', {
      authenticatorId,
      credential: {
        credentialId: credentialId.toString('base64'),
        isResidentCredential: false,
        rpId: 'localhost',
        privateKey: privateKey
          .export({ format: 'der', type: 'pkcs8' })
          .toString('base64'),
        signCount: 0,
      },
    })

    // App Lock on, unlocked by that passkey; the next launch starts locked.
    await closeApp(app)
    await writeStoreRow(
      app,
      'mmkv.default',
      'app-lock',
      JSON.stringify({
        state: {
          enabled: true,
          requireAfter: 60,
          webCredentials: { rpId: 'localhost', ids: [b64u(credentialId)] },
        },
        version: 0,
      })
    )
    const name = 'Taylor Brooks'
    const payload = contactPayload(name)
    await app.goto(`/contacts#${payload}`)
    await expect(app.getByText(en.appLock_lockedTitle)).toBeVisible()
    expect(new URL(app.url()).hash).toBe('')
    const asked = answerDialog(app)
    await app.getByTestId('app-lock-unlock').click()
    expect(await asked).toContain(importQuestion(name))
    await expect.poll(() => savedContacts(app)).toEqual([name])
  })
})
