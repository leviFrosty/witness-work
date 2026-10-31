import Constants from 'expo-constants'
import { toAppVariant, type AppVariant } from '@/lib/toAppVariant'

export { toAppVariant, type AppVariant }

export const appVariant: AppVariant = toAppVariant(
  (Constants.expoConfig?.extra as { appVariant?: unknown } | undefined)
    ?.appVariant
)
