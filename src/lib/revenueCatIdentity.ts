import { create } from 'zustand'
import { getOrCreateAccountId, onAccountIdChange } from '@/lib/account'

type State = {
  appUserId: string | null | undefined

  changes: number
}

const useRevenueCatIdentity = create<State>(() => ({
  appUserId: undefined,
  changes: 0,
}))

onAccountIdChange(() =>
  useRevenueCatIdentity.setState((state) => ({ changes: state.changes + 1 }))
)

export const noteRevenueCatAppUserId = (appUserId: string | null): void =>
  useRevenueCatIdentity.setState({ appUserId })

const isOwn = (appUserId: string | null | undefined): boolean => {
  if (appUserId === null) return false

  if (appUserId === undefined || appUserId.startsWith('$RCAnonymousID'))
    return true
  try {
    return appUserId === getOrCreateAccountId()
  } catch {
    return true
  }
}

export const revenueCatIsOwn = (): boolean =>
  isOwn(useRevenueCatIdentity.getState().appUserId)

export const useRevenueCatIsOwn = (): boolean =>
  useRevenueCatIdentity((state) => isOwn(state.appUserId))

let devLogInsFail = false

export const setDevRevenueCatLogInsFail = (fail: boolean): void => {
  if (__DEV__) devLogInsFail = fail
}

export const devRevenueCatLogInsFail = (): boolean => __DEV__ && devLogInsFail
