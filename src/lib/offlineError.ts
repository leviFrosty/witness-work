import { isConnectivityError } from '@/lib/http/networkError'

export const isOfflineError = (error: unknown): boolean =>
  isConnectivityError(error)
