import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { AppState } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import { logger } from '@/lib/logger'
import { analytics } from '@/lib/analytics'
import {
  SyncTransportError,
  type TransportSubscription,
} from '@/lib/syncTransport/types'
import {
  DRIVE_API_ORIGIN,
  classifyDriveError,
  errorReason,
  retryAfterMs,
} from '@/lib/syncTransport/googleDrive/driveApi'
import {
  GoogleDriveAuthError,
  googleDriveAuthErrorCode,
  type GoogleDriveAuthErrorCode,
} from '../../../../modules/google-drive-auth/errorCodes'

/**
 * Google Drive access on Android (ADR 0019): which Google Account this device
 * syncs with, and short-lived OAuth tokens for its app data folder.
 *
 * Connecting is an explicit user action (Google's account picker and consent
 * screen). Afterwards tokens refresh silently about hourly. Each fresh token is
 * checked against the connected account before Drive is used with it, so a
 * device that silently switched accounts never reads or writes another person's
 * folder. The account is remembered only as a hash of its Drive `permissionId`,
 * never by email.
 *
 * The native module loads on first use: importing it eagerly would pull
 * `expo-modules-core` into every module that imports the sync engine.
 */

type NativeAuth = typeof import('../../../../modules/google-drive-auth')
let native: Promise<NativeAuth> | null = null
const loadNative = () =>
  (native ??= import('../../../../modules/google-drive-auth'))

/** Google says tokens last an hour; refresh a little early. */
const TOKEN_TTL_MS = 50 * 60_000
/** Longest a Drive account lookup or silent authorization may take. */
const REQUEST_TIMEOUT_MS = 30_000
/**
 * After the app comes back from Google's consent screen, how long its result
 * may take to arrive before the attempt counts as cancelled.
 */
const CONSENT_RESULT_GRACE_MS = 3_000

type Grant = { token: string; at: number; account: string }
let cached: Grant | null = null
let inflight: { promise: Promise<Grant>; generation: number } | null = null
/**
 * Bumped by connect, disconnect and the dev fake. A token request that started
 * before is discarded, so it can't undo the user's choice.
 */
let generation = 0

const listeners = new Set<(event: { available: boolean }) => void>()

/**
 * Dev builds only: a local fake Drive server and account, so verification can
 * run sync between emulators without a Google Account (see
 * `scripts/verify/fake-google-drive-server.mjs`).
 */
export type FakeGoogleDrive = { origin: string; account: string }
let fake: FakeGoogleDrive | null = null

export function setFakeGoogleDrive(next: FakeGoogleDrive | null): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return
  fake = next
  generation++
  cached = null
  notifyAvailability()
}

export const googleDriveOrigin = (): string => fake?.origin ?? DRIVE_API_ORIGIN

const connectedAccount = () => usePreferences.getState().googleDriveAccountId

export function isGoogleDriveConnected(): boolean {
  const { googleDriveAccountId, googleDriveNeedsReconnect } =
    usePreferences.getState()
  return googleDriveAccountId !== null && !googleDriveNeedsReconnect
}

function notifyAvailability(): void {
  const available = isGoogleDriveConnected()
  listeners.forEach((listener) => listener({ available }))
}

export function addGoogleDriveAvailabilityListener(
  listener: (event: { available: boolean }) => void
): TransportSubscription {
  listeners.add(listener)
  return { remove: () => listeners.delete(listener) }
}

/** What's stored instead of the Drive user id: a one-way, versioned hash. */
export function hashGoogleDriveAccount(permissionId: string): string {
  return bytesToHex(
    sha256(utf8ToBytes(`witnesswork.google-drive-account|1|${permissionId}`))
  )
}

const unauthorized = (message: string) =>
  new SyncTransportError('unauthorized', message)

function withTimeout<T>(promise: Promise<T>, error: () => Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(error()), REQUEST_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (reason) => {
        clearTimeout(timer)
        reject(reason)
      }
    )
  })
}

/** The hashed account a token belongs to, from Drive's `about.get`. */
async function currentAccount(token: string): Promise<string> {
  const controller =
    typeof AbortController === 'undefined' ? null : new AbortController()
  const timer = controller
    ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null
  let status: number
  let text = ''
  let retryAfter: string | null = null
  try {
    const response = await fetch(
      `${googleDriveOrigin()}/drive/v3/about?fields=${encodeURIComponent('user(permissionId)')}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller?.signal,
      }
    )
    status = response.status
    retryAfter = response.headers?.get?.('retry-after') ?? null
    text = await response.text()
  } catch (error) {
    throw new SyncTransportError('network', String(error))
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (status < 200 || status >= 300) {
    // Only a refused token is `unauthorized`, which can end in "Reconnect
    // Google Drive". A throttled or over-quota project answers 403 too, and
    // must not disconnect anyone.
    const reason = errorReason(text)
    const code = classifyDriveError(status, reason)
    throw new SyncTransportError(
      code === 'unknown' ? 'network' : code,
      `Drive about ${status}${reason ? ` ${reason}` : ''}`,
      retryAfterMs(retryAfter)
    )
  }
  let body: { user?: { permissionId?: unknown } } | null = null
  try {
    body = JSON.parse(text)
  } catch {
    throw new SyncTransportError('unknown', 'Drive returned malformed JSON')
  }
  const id = body?.user?.permissionId
  if (typeof id !== 'string' || !id)
    throw new SyncTransportError('unknown', 'Drive returned no account')
  return hashGoogleDriveAccount(id)
}

/**
 * Settles an interactive authorization once Google's screen is gone: its result
 * arrives before the app is active again, so a result still missing shortly
 * after means the screen went away without one.
 */
function untilConsentReturns(request: Promise<string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let left = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        left = true
        return
      }
      if (!left || timer) return
      timer = setTimeout(
        () => reject(new GoogleDriveAuthError('canceled')),
        CONSENT_RESULT_GRACE_MS
      )
    })
    request.then(resolve, reject).finally(() => {
      sub.remove()
      if (timer) clearTimeout(timer)
    })
  })
}

function authorize(options: {
  interactive: boolean
  selectAccount?: boolean
}): Promise<string> {
  if (fake) return Promise.resolve(`fake:${fake.account}`)
  const request = loadNative().then((auth) => auth.authorize(options))
  return options.interactive
    ? untilConsentReturns(request)
    : withTimeout(request, () => new GoogleDriveAuthError('network'))
}

async function forget(token: string): Promise<void> {
  if (fake) return
  try {
    await (await loadNative()).clearToken(token)
  } catch (error) {
    logger.warn('[GoogleDrive] clearToken failed', error)
  }
}

/**
 * Only for the request's own connection: a refusal that arrives after a
 * disconnect or a new connection says nothing about the current one.
 */
function needReconnect(started: number): void {
  if (started !== generation || connectedAccount() === null) return
  if (usePreferences.getState().googleDriveNeedsReconnect) return
  usePreferences.setState({ googleDriveNeedsReconnect: true })
  logger.warn('[GoogleDrive] access needs the user again')
  analytics.capture('google_drive_access_lost')
  notifyAvailability()
}

/** A token from Google without UI, its failures classified for sync. */
async function silentToken(started: number): Promise<string> {
  try {
    return await authorize({ interactive: false })
  } catch (error) {
    const code = googleDriveAuthErrorCode(error)
    if (code === 'network')
      throw new SyncTransportError('network', 'Google authorization offline')
    if (code === 'consentRequired' || code === 'scopeDenied')
      needReconnect(started)
    throw unauthorized(`Google authorization ${code}`)
  }
}

async function fetchGrant(started: number): Promise<Grant> {
  let token = await silentToken(started)
  let account: string
  try {
    account = await currentAccount(token)
  } catch (error) {
    if (!(error instanceof SyncTransportError) || error.code !== 'unauthorized')
      throw error
    // Play services can still hand out a token revoked elsewhere; drop it and
    // ask once more. Refused again, the grant is gone.
    await forget(token)
    token = await silentToken(started)
    try {
      account = await currentAccount(token)
    } catch (retryError) {
      if (
        retryError instanceof SyncTransportError &&
        retryError.code === 'unauthorized'
      )
        needReconnect(started)
      throw retryError
    }
  }
  if (started !== generation)
    throw unauthorized('Google Drive connection changed')
  const connected = connectedAccount()
  if (connected === null) throw unauthorized('Google Drive not connected')
  if (account !== connected) {
    // Silent authorization picked another account (the connected one was
    // removed from the device, or this is a restored copy). Record it so the
    // identity check turns sync off before anything is read or written.
    usePreferences.setState({ googleDriveAccountId: account })
    logger.warn('[GoogleDrive] Google Account changed')
    notifyAvailability()
    throw unauthorized('Google Account changed')
  }
  return { token, at: Date.now(), account }
}

/**
 * One token request at a time. `stale`, a token Drive just rejected, is cleared
 * first; a request already running that hands back that same token is followed
 * by a fresh one.
 */
function sharedGrant(stale: string | null): Promise<Grant> {
  const run = async (): Promise<Grant> => {
    const started = generation
    if (stale) await forget(stale)
    const grant = await fetchGrant(started)
    if (started === generation) cached = grant
    return grant
  }
  const running = inflight?.generation === generation ? inflight.promise : null
  const promise = running
    ? running.then((grant) => (stale && grant.token === stale ? run() : grant))
    : run()
  const entry = { promise, generation }
  inflight = entry
  void promise
    .finally(() => {
      if (inflight === entry) inflight = null
    })
    .catch(() => {})
  return promise
}

/**
 * A token for `account` (by default the connected one). `refresh` replaces
 * `rejected`, a token Drive refused. Throws `unauthorized` when the user must
 * reconnect, or when `account` is no longer the connected account: an operation
 * that began under one account never continues under another.
 */
export async function googleDriveAccessToken({
  refresh,
  rejected,
  account,
}: {
  refresh: boolean
  rejected?: string
  account?: string | null
}): Promise<string> {
  const expected = account === undefined ? connectedAccount() : account
  const forExpected = (grant: Grant) => {
    if (grant.account !== expected || connectedAccount() !== expected)
      throw unauthorized('Google Account changed')
    return grant.token
  }
  if (!isGoogleDriveConnected() || expected === null)
    throw unauthorized('Google Drive not connected')
  if (connectedAccount() !== expected)
    throw unauthorized('Google Account changed')
  if (refresh) {
    // Someone else already replaced the rejected token.
    if (cached && rejected !== undefined && cached.token !== rejected)
      return forExpected(cached)
    const stale = rejected ?? cached?.token ?? null
    if (cached?.token === stale) cached = null
    return forExpected(await sharedGrant(stale))
  }
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS)
    return forExpected(cached)
  return forExpected(await sharedGrant(null))
}

export type GoogleDriveConnectOutcome =
  | 'connected'
  | Exclude<GoogleDriveAuthErrorCode, 'consentRequired'>

/**
 * Shows Google's account picker and consent screen and connects the chosen
 * account. `selectAccount` shows the picker even when an account is already
 * granted, to switch. Connecting a different account than sync last used turns
 * sync off at its next check (see `checkICloudIdentity`).
 */
export async function connectGoogleDrive({
  selectAccount = false,
}: { selectAccount?: boolean } = {}): Promise<GoogleDriveConnectOutcome> {
  generation++
  let token: string
  try {
    token = await authorize({ interactive: true, selectAccount })
  } catch (error) {
    const code = googleDriveAuthErrorCode(error)
    return code === 'consentRequired' ? 'canceled' : code
  }
  let account: string
  try {
    account = await currentAccount(token)
  } catch (error) {
    logger.warn('[GoogleDrive] account lookup failed', error)
    return error instanceof SyncTransportError && error.code === 'network'
      ? 'network'
      : 'unknown'
  }
  generation++
  cached = { token, at: Date.now(), account }
  usePreferences.setState({
    googleDriveAccountId: account,
    googleDriveNeedsReconnect: false,
  })
  notifyAvailability()
  return 'connected'
}

/**
 * Forgets the connected account on this device. Google's grant stays, because
 * it's shared by every device signed in to that account: revoking it would stop
 * the user's other devices too. The app data folder stays for them; Google's
 * Drive settings can delete it ("Manage apps").
 */
export async function disconnectGoogleDrive(): Promise<void> {
  generation++
  const token = cached?.token ?? null
  cached = null
  if (token) await forget(token)
  usePreferences.setState({
    googleDriveAccountId: null,
    googleDriveNeedsReconnect: false,
  })
  notifyAvailability()
}

/** Whether this binary can connect Google Drive at all. */
export async function googleDriveSupported(): Promise<boolean> {
  if (fake) return true
  try {
    return (await loadNative()).isSupported()
  } catch {
    return false
  }
}
