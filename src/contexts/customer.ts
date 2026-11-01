import { createContext } from 'react'
import { CustomerInfo } from 'react-native-purchases'

export type CustomerCtx = {
  customer: CustomerInfo | null
  revalidate: () => Promise<void>
  hasPurchasedBefore: boolean
  setCustomer: React.Dispatch<React.SetStateAction<CustomerInfo | null>>

  ready: boolean

  unavailable: boolean
}

export const CustomerContext = createContext<CustomerCtx | null>(null)
