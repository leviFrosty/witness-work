import { create } from 'zustand'
import { getOrCreateAccountId, onAccountIdChange } from '@/lib/account'

/**
 * Whether RevenueCat is logged in as the id this device should be
 * (`getOrCreateAccountId`). After another server account signs in, the id
 * adopted for the previous one is dropped, but RevenueCat stays on it until
 * `AccountProvider` logs in again, which can wait for a connection. Until then
 * its customer, and the Supporter status it shows, is the previous account's.
 */

type State = {
  /**
   * The id RevenueCat was last logged in as this launch: undefined until a
   * login (or the launch's fallback) says.
   */
  appUserId: string | undefined
  /** Bumped when the id this device should be may have changed. */
  changes: number
}

const useRevenueCatIdentity = create<State>(() => ({
  appUserId: undefined,
  changes: 0,
}))

onAccountIdChange(() =>
  useRevenueCatIdentity.setState((state) => ({ changes: state.changes + 1 }))
)

/** RevenueCat is now logged in as `appUserId`. */
export const noteRevenueCatAppUserId = (appUserId: string): void =>
  useRevenueCatIdentity.setState({ appUserId })

const isOwn = (appUserId: string | undefined): boolean => {
  // Unknown, or an anonymous id: no other account's customer.
  if (appUserId === undefined || appUserId.startsWith('$RCAnonymousID'))
    return true
  try {
    return appUserId === getOrCreateAccountId()
  } catch {
    // The id can't be read yet (a locked Keychain): nothing to tell it from.
    return true
  }
}

/** Whether RevenueCat's customer is this device's own now. */
export const revenueCatIsOwn = (): boolean =>
  isOwn(useRevenueCatIdentity.getState().appUserId)

/** `revenueCatIsOwn`, for components. */
export const useRevenueCatIsOwn = (): boolean =>
  useRevenueCatIdentity((state) => isOwn(state.appUserId))

let devLogInsFail = false

/**
 * Dev harness only: RevenueCat logins fail as offline while `fail`, so a switch
 * RevenueCat can't follow yet can be driven on a simulator.
 */
export const setDevRevenueCatLogInsFail = (fail: boolean): void => {
  if (__DEV__) devLogInsFail = fail
}

/** Whether the dev harness makes RevenueCat logins fail. */
export const devRevenueCatLogInsFail = (): boolean => __DEV__ && devLogInsFail
