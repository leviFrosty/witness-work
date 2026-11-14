import { appVariant } from '@/lib/appVariant'

export const FAKE_WALLET_STEPS = [100, 1000] as const

export const FAKE_WALLET_MAX = 100000

export const fakeWalletWorks = () => __DEV__ || appVariant !== 'production'
