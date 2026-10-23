import { AppState } from 'react-native'
import {
  notePetUnlocks,
  usePetUnlockNews,
} from '@/features/pet/stores/petUnlockNews'
import { actionBehind, celebrationClaim } from '@/lib/userAction'
import type { RoomItemId } from '@/types/pet'

/**
 * Items that just opened up arrive by the action rule (ADR 0021, ADR 0034):
 * right after something the User did in the foreground, an unlock toast each
 * (`PetUnlockRevealHost` shows them); otherwise (another device, a new month at
 * launch) only the tray lists them. Either way they're news until the User
 * settles them.
 */
export function announcePetUnlocks(
  items: readonly RoomItemId[],
  petName: string,
  now = Date.now()
) {
  if (!items.length) return
  notePetUnlocks(items, now)
  const action = actionBehind(now, now)
  if (!action || AppState.currentState !== 'active') return
  usePetUnlockNews.setState(({ toasting }) => ({
    toasting: {
      items: [...(toasting?.items ?? []), ...items],
      petName,
      expiresAt: celebrationClaim(action).expiresAt,
    },
  }))
}
