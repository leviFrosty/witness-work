import { logger } from '@/lib/logger'
import type { ScribeErrorCode } from '@/features/scribe/types'
import { scribeClient } from '@/features/scribe/lib/defaultClient'
import { toScribeClientError } from '@/features/scribe/lib/errors'
import type {
  TerritoryNotesRequest,
  TerritoryNotesResponse,
} from '@/features/scribe/lib/wire'
import { noteScribeFailure } from '@/features/scribe/runtime/status'
import { noteUsage } from '@/features/scribe/stores/usage'

export type ScribeNotesFailure =
  | 'limited'
  | 'offline'
  | 'unavailable'
  | 'failed'

export type ScribeNotesRead =
  | { status: 'read'; result: TerritoryNotesResponse }
  | { status: 'failed'; reason: ScribeNotesFailure }
  | { status: 'cancelled' }

const QUIET: ReadonlySet<ScribeErrorCode> = new Set<ScribeErrorCode>([
  'network',
  'timeout',
  'limit_reached',
  'model_error',
  'disabled',
  'unavailable',
])

export const notesFailureFor = (code: ScribeErrorCode): ScribeNotesFailure => {
  switch (code) {
    case 'limit_reached':
      return 'limited'
    case 'network':
      return 'offline'
    case 'disabled':
    case 'unavailable':
    case 'update_required':
    case 'suspended':
    case 'device_ineligible':
    case 'attestation_unavailable':
    case 'rate_limited':
      return 'unavailable'
    default:
      return 'failed'
  }
}

export async function readTerritoryNotesWithScribe(
  notes: Omit<TerritoryNotesRequest, 'protocol'>,
  signal?: AbortSignal
): Promise<ScribeNotesRead> {
  try {
    const result = await scribeClient().territoryNotes(notes, signal)
    noteUsage(result.usage)
    return { status: 'read', result }
  } catch (thrown) {
    const failure = toScribeClientError(thrown)
    noteUsage(failure.usage)
    if (failure.code === 'cancelled' || signal?.aborted)
      return { status: 'cancelled' }
    noteScribeFailure(failure)
    if (!QUIET.has(failure.code))
      logger.warn('[scribe] territory notes failed', failure.code)
    return { status: 'failed', reason: notesFailureFor(failure.code) }
  }
}
