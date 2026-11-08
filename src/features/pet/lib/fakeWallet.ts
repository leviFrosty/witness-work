import { appVariant } from '@/lib/appVariant'

export const FAKE_WALLETS = [
  0, 100, 500, 1000, 2500, 5000, 10000, 50000,
] as const

export const fakeWalletWorks = () => __DEV__ || appVariant !== 'production'
