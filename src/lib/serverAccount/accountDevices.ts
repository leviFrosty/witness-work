import apis from '@/constants/apis'
import { accountSessions, isThisDeviceSession } from '@/lib/serverAccount'
import {
  type AccountDevice,
  type ActivityClientOptions,
  fetchAccountDevices,
} from '@/lib/serverAccount/activityClient'

/** Activity client options for one account key's session. */
export const activityOptions =
  (accountKey: Uint8Array, signal?: AbortSignal) =>
  (renew = false): ActivityClientOptions => ({
    baseUrl: apis.accounts,
    request: (request) =>
      accountSessions.request(request, { accountKey, renew }),
    signal,
  })

/**
 * The account's signed-in devices. A list without this device's session means
 * another device signed this one out while its access token still worked
 * (servers before ww-api #52 answered then): a new token signs it back in, as
 * the sign-out promises, and the list is read again with it.
 */
export async function readAccountDevices(
  accountKey: Uint8Array,
  signal?: AbortSignal
): Promise<AccountDevice[]> {
  const options = activityOptions(accountKey, signal)
  const devices = await fetchAccountDevices(options())
  if (devices.some((device) => device.current)) return devices
  return fetchAccountDevices(options(true))
}

/**
 * Whether another device is signed in to this account key's account: a live
 * session that was never this install's. Throws when the list can't be read.
 */
export async function signedInElsewhere(
  accountKey: Uint8Array,
  signal?: AbortSignal
): Promise<boolean> {
  const devices = await readAccountDevices(accountKey, signal)
  return devices.some(
    (device) => !device.current && !isThisDeviceSession(device.sessionId)
  )
}
