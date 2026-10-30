import { accountKey } from '@/app/account/accountKey'
import {
  isThisDeviceSession,
  keyHistoryCache,
  serverAccount,
} from '@/lib/serverAccount'
import {
  activityOptions,
  readAccountDevices,
} from '@/lib/serverAccount/accountDevices'
import {
  type AccountDevice,
  type ActivityPage,
  fetchAccountActivity,
  revokeAccountDevice,
} from '@/lib/serverAccount/activityClient'
import {
  createDeviceLabelReader,
  type DeviceLabelReader,
} from '@/lib/serverAccount/activityLabels'

/**
 * Settings → Account → Devices and Activity (ADR 0028), through this device's
 * attested session. Both need the account key already on this device: the
 * screens are only offered once the account is set up.
 */

/** What reading them needs besides the answer: whose session, and labels. */
export type AccountActivityContext = {
  /**
   * Whether a session is this device's: the current one, or one this install
   * had before it signed in again.
   */
  isThisDevice: (sessionId: string) => boolean
  readLabel: DeviceLabelReader
}

export class AccountNotSetUpError extends Error {
  constructor() {
    super('No account key on this device')
    this.name = 'AccountNotSetUpError'
  }
}

async function connect(signal?: AbortSignal) {
  const key = await accountKey.peek()
  if (!key) throw new AccountNotSetUpError()
  // Labels sealed before the account key changed open with the key history.
  const accountId = serverAccount.cached(key)?.accountId
  const history = accountId
    ? await keyHistoryCache.read(accountId).catch(() => null)
    : null
  const readLabel = createDeviceLabelReader(key, history)
  const options = activityOptions(key, signal)
  const context = (): AccountActivityContext => ({
    isThisDevice: isThisDeviceSession,
    readLabel,
  })
  return { key, options, context }
}

/** The account's signed-in devices (`readAccountDevices`), and how to read them. */
export async function loadAccountDevices(
  signal?: AbortSignal
): Promise<{ devices: AccountDevice[]; context: AccountActivityContext }> {
  const { key, context } = await connect(signal)
  const devices = await readAccountDevices(key, signal)
  return { devices, context: context() }
}

export async function signOutAccountDevice(sessionId: string): Promise<void> {
  const { options } = await connect()
  await revokeAccountDevice(sessionId, options())
}

/** Entries per page. */
export const ACTIVITY_PAGE_SIZE = 50

export async function loadAccountActivity(
  before: string | null,
  signal?: AbortSignal
): Promise<ActivityPage & { context: AccountActivityContext }> {
  const { options, context } = await connect(signal)
  const page = await fetchAccountActivity(
    { before, limit: ACTIVITY_PAGE_SIZE },
    options()
  )
  return { ...page, context: context() }
}
