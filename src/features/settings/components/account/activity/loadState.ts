import { HttpError } from '@/lib/http/request'

/** Why a list couldn't load: offline, or anything else. */
export type LoadFailure = 'offline' | 'failed'

export const loadFailure = (error: unknown): LoadFailure =>
  error instanceof HttpError && error.kind === 'offline' ? 'offline' : 'failed'
