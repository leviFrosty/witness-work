import { createContext } from 'react'
import { CustomerInfo } from 'react-native-purchases'

export type CustomerCtx = {
  customer: CustomerInfo | null
  revalidate: () => Promise<void>
  hasPurchasedBefore: boolean
  setCustomer: React.Dispatch<React.SetStateAction<CustomerInfo | null>>
  /**
   * True once `Purchases.configure` has run. Required before any other SDK
   * calls.
   */
  ready: boolean
  /** Configuration failed; purchase screens should show an unavailable state. */
  unavailable: boolean
}

export const CustomerContext = createContext<CustomerCtx | null>(null)
