import { createContext } from 'react'

export type AccountCtx = {
  accountId: string | null

  iCloudSharingAvailable: boolean
}

export const AccountContext = createContext<AccountCtx | null>(null)
