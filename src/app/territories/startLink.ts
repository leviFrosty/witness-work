import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { isSpaceError, SpaceError } from '@/lib/sharedSpaces/client'
import { toast } from '@/stores/toasts'
import { useTerritoriesSession } from '@/stores/territoriesSession'
import { TerritorySharingError } from '@/app/territories/engine/types'
import {
  SHARING_FAILURE_TEXT,
  startFailureText,
} from '@/app/territories/sharingFailure'

export const LINK_START_DEADLINE_MS = 60_000

export type StartedLink = { linkId: string; url: string }

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SpaceError('timeout')), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

const failureName = (error: unknown) =>
  isSpaceError(error) || error instanceof TerritorySharingError
    ? error.code
    : error instanceof Error
      ? error.name
      : 'unknown'

export async function startLink(
  start: () => Promise<StartedLink>,
  ms = LINK_START_DEADLINE_MS
): Promise<StartedLink | null> {
  if (!useTerritoriesSession.getState().running) {
    toast.error(i18n.t(SHARING_FAILURE_TEXT.needsBuddies))
    return null
  }
  try {
    return await withDeadline(Promise.resolve().then(start), ms)
  } catch (error) {
    logger.warn(`[territories] link/create: ${failureName(error)}`)
    toast.error(i18n.t(startFailureText(error)))
    return null
  }
}
