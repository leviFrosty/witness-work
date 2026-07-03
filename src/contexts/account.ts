import { createContext } from 'react'

export type AccountCtx = {
  /**
   * The stable cross-device identity (ADR 0011): RevenueCat app user id and
   * ww-proxy uuid. Null only if id resolution failed at boot.
   */
  accountId: string | null
  /**
   * Whether Supporter status can reach the user's other devices automatically
   * (signed into iCloud + ubiquity container reachable). When false, the only
   * path is Restore Purchases on the other device — surface the hint.
   */
  iCloudSharingAvailable: boolean
}

export const AccountContext = createContext<AccountCtx | null>(null)
