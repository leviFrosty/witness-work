import { AppState } from 'react-native'
import {
  notePetUnlocks,
  usePetUnlockNews,
} from '@/features/pet/stores/petUnlockNews'
import { actionBehind, celebrationClaim } from '@/lib/userAction'
import type { RoomItemId } from '@/types/pet'

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
