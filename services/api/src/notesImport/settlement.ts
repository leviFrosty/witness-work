import { isSupporter, RevenueCatError } from '../revenuecat'
import { Sentry } from '../sentry'
import type { Environment } from '../types'
import { isAccountSupporter } from '../accounts/supporter'

export interface ResolveTerminalSupporterArgs {
  kickoffSupporter: boolean
  devBypass: boolean
  apiKey: string
  appUserId: string
  entitlementId: string
  /** `countsWebSandboxSubscriptions(env)`, for the lookup by `appUserId`. */
  countWebSandbox?: boolean
  /**
   * A bearer run's account: its Supporter status (`isAccountSupporter`, from
   * the account's linked RevenueCat customers) replaces the lookup by
   * `appUserId`. `env` supplies the accounts database.
   */
  account?: {
    accountId: string
    env: Pick<Environment, 'REVENUECAT_API_KEY' | 'ACCOUNTS_DB'>
  }
  /** Injectable for the smallest public regression seam. */
  checkSupporter?: typeof isSupporter
  checkAccountSupporter?: typeof isAccountSupporter
  captureException?: (error: unknown) => void
}

/**
 * Refresh entitlement for a successful run. A confirmed RevenueCat result may
 * change tiers, but a failed refresh retains the entitlement observed at
 * kickoff rather than manufacturing a downgrade.
 */
export const resolveTerminalSupporter = async ({
  kickoffSupporter,
  devBypass,
  apiKey,
  appUserId,
  entitlementId,
  countWebSandbox = false,
  account,
  checkSupporter = isSupporter,
  checkAccountSupporter = isAccountSupporter,
  captureException = Sentry.captureException,
}: ResolveTerminalSupporterArgs): Promise<boolean> => {
  if (devBypass) return kickoffSupporter

  try {
    return account
      ? await checkAccountSupporter(account.env, account.accountId)
      : await checkSupporter({ apiKey, appUserId, entitlementId, countWebSandbox })
  } catch (error) {
    if (!(error instanceof RevenueCatError)) captureException(error)
    return kickoffSupporter
  }
}
