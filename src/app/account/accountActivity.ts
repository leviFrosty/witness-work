import apis from '@/constants/apis'
import { accountKey } from '@/app/account/accountKey'
import { accountSessions, isThisDeviceSession } from '@/lib/serverAccount'
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
  const readLabel = createDeviceLabelReader(key)
  const options = (renew = false): ActivityClientOptions => ({
    baseUrl: apis.accounts,
    request: (request) =>
      accountSessions.request(request, { accountKey: key, renew }),
    signal,
  })
  const context = (): AccountActivityContext => ({
    isThisDevice: isThisDeviceSession,
    readLabel,
  })
  return { options, context }
}

/**
 * The account's signed-in devices. A list without this device's session means
 * another device signed this one out while its access token still worked
 * (servers before ww-api #52 answered then): a new token signs it back in, as
 * the sign-out promises, and the list is read again with it.
 */
export async function loadAccountDevices(
  signal?: AbortSignal
): Promise<{ devices: AccountDevice[]; context: AccountActivityContext }> {
  const { options, context } = await connect(signal)
  let devices = await fetchAccountDevices(options())
  if (!devices.some((device) => device.current))
    devices = await fetchAccountDevices(options(true))
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
