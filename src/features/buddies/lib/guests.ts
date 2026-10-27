import { toB64u, utf8 } from '@/features/buddies/lib/bytes'
import { sha256 } from '@/features/buddies/lib/crypto'
import type { ShareGuest } from '@/features/buddies/lib/schemas'
import type {
  Buddy,
  IncomingShare,
  IncomingShareStatus,
} from '@/features/buddies/lib/state'

/**
 * Names someone going to a shared Plan for the others going, without saying who
 * they are anywhere else. It's the first 16 bytes of
 * `SHA-256("ww-buddies/v1/guest|" + shareId + "|" + inboxId)`. A phone works it
 * out for its own buddies to know which guests they are; to anyone else it
 * means nothing, and it differs on every Plan.
 */
export const guestTag = (shareId: string, inboxId: string): string =>
  toB64u(sha256(utf8(`ww-buddies/v1/guest|${shareId}|${inboxId}`)).slice(0, 16))

/** Someone else going to a buddy's Plan: one of this User's buddies, or not. */
export type PlanGuest =
  | { kind: 'buddy'; buddy: Buddy }
  | { kind: 'guest'; guest: ShareGuest }

/**
 * The others going to a buddy's Plan as this User sees them: their own buddies
 * as they know them (nickname, photo, page), everyone else as the organizer
 * listed them.
 */
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

/** Who's going to a buddy's Plan or Follow-up, as this User can see it. */
export type WhosGoing = {
  /** The others going this User can name. */
  guests: PlanGuest[]
  /** Others going whose apps don't list them: counted, never named. */
  more: number
  /** Everyone going: the organizer, the others, and the User once they are. */
  count: number
}

/**
 * Who's going, as the organizer last listed them for this User: everyone
 * invited sees the others going (never themselves), answered or not, so they
 * know who'll be there before they answer.
 */
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
