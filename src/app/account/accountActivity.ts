import apis from '@/constants/apis'
import { accountKey } from '@/app/account/accountKey'
import { accountSessions } from '@/lib/serverAccount'
import {
  type AccountDevice,
  type ActivityClientOptions,
  type ActivityPage,
  fetchAccountActivity,
  fetchAccountDevices,
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
  /** This device's session, to mark "This device". */
  currentSessionId: string | null
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
  const readLabel = createDeviceLabelReader(key)
  const options: ActivityClientOptions = {
    baseUrl: apis.accounts,
    request: (request) => accountSessions.request(request, { accountKey: key }),
    signal,
  }
  // After a request, the session it used is this device's.
  const context = (): AccountActivityContext => ({
    currentSessionId: accountSessions.snapshot()?.sessionId ?? null,
    readLabel,
  })
  return { options, context }
}

export async function loadAccountDevices(
  signal?: AbortSignal
): Promise<{ devices: AccountDevice[]; context: AccountActivityContext }> {
  const { options, context } = await connect(signal)
  const devices = await fetchAccountDevices(options)
  return { devices, context: context() }
}

export async function signOutAccountDevice(sessionId: string): Promise<void> {
  const { options } = await connect()
  await revokeAccountDevice(sessionId, options)
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
    options
  )
  return { ...page, context: context() }
}
