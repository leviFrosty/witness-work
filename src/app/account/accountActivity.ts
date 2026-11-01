import { accountKey } from '@/app/account/accountKey'
import { isThisDeviceSession } from '@/lib/serverAccount'
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

export type AccountActivityContext = {
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
  const options = activityOptions(key, signal)
  const context = (): AccountActivityContext => ({
    isThisDevice: isThisDeviceSession,
    readLabel,
  })
  return { key, options, context }
}

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
