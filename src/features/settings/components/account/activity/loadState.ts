import { HttpError } from '@/lib/http/request'

export type LoadFailure = 'offline' | 'failed'

export const loadFailure = (error: unknown): LoadFailure =>
  error instanceof HttpError && error.kind === 'offline' ? 'offline' : 'failed'
