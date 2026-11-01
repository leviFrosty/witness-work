import { toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { sha256 } from '@/features/buddies/lib/crypto'
import type { ShareGuest } from '@/features/buddies/lib/schemas'
import type {
  Buddy,
  IncomingShare,
  IncomingShareStatus,
} from '@/features/buddies/lib/state'

export const guestTag = (shareId: string, inboxId: string): string =>
  toB64u(sha256(utf8(`ww-buddies/v1/guest|${shareId}|${inboxId}`)).slice(0, 16))

export type PlanGuest =
  | { kind: 'buddy'; buddy: Buddy }
  | { kind: 'guest'; guest: ShareGuest }

export function planGuests(
  shareId: string,
  people: ShareGuest[] | undefined,
  buddies: Buddy[]
): PlanGuest[] {
  if (!people?.length) return []
  const byTag = new Map(
    buddies
      .filter((buddy) => buddy.status === 'active')
      .map((buddy) => [guestTag(shareId, buddy.inboxId), buddy])
  )
  return people.map((guest) => {
    const buddy = byTag.get(guest.t)
    return buddy ? { kind: 'buddy', buddy } : { kind: 'guest', guest }
  })
}

export type WhosGoing = {
  guests: PlanGuest[]

  more: number

  count: number
}

export function whosGoing(
  share: IncomingShare | undefined,
  status: IncomingShareStatus,
  buddies: Buddy[]
): WhosGoing {
  const plan = share?.type === 'plan'
  const guests = plan ? planGuests(share.shareId, share.people, buddies) : []
  const more = plan ? (share.more ?? 0) : 0
  return {
    guests,
    more,
    count: 1 + guests.length + more + (status === 'going' ? 1 : 0),
  }
}
