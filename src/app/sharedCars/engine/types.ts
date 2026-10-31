import type { SpaceErrorCode, SpacesClient } from '@/lib/sharedSpaces/client'
import type { SpaceKeyring } from '@/lib/sharedSpaces/keyring'
import type { SharedCarsStore } from '@/stores/sharedCars'
import type { SharedCarsSessionStore } from '@/stores/sharedCarsSession'
import type { SharedCarProfileProvider } from '@/app/sharedCars/profile'
import type { MileageSnapshot } from '@/types/mileage'
import type { CarInvitePayload } from '@/types/sharedCars'

/** The Shared Cars engine's public types (`createSharedCarsEngine`). */

/** A put a suspended account made waits this long before trying again. */
export const SUSPENDED_PUT_WAIT_MS = 60 * 1000

export type SharedCarsErrorCode =
  /** This device has no account key (the Buddies root seed). */
  | 'no_account_key'
  /** No such car here, or no such car of the User's own to share. */
  | 'not_found'
  /** Only the car's owner can do that. */
  | 'not_owner'
  /** This device doesn't hold the car's key: it went with a reset. */
  | 'not_ready'
  /** An invitation that isn't one. */
  | 'invalid_invite'
  /**
   * A wrap or the key chain offered another key for an epoch this device
   * already trusts a key for: it kept its own (docs/shared-cars-protocol.md,
   * "The own wrap").
   */
  | 'key_mismatch'
  /**
   * Nothing vouches for the car's current key yet (the key chain or the User's
   * key check), or it's older than one this device trusts: the car waits,
   * opening and sharing nothing under it, and nothing can be shared or invited
   * from here until it doesn't.
   */
  | 'key_unverified'
  /**
   * Someone on the car has no member record this device can vouch for, so the
   * owner's device doesn't rekey until they do or are removed.
   */
  | 'member_unverified'

/** A Shared Cars operation this device refused before asking the server. */
export class SharedCarsError extends Error {
  constructor(readonly code: SharedCarsErrorCode) {
    super(`Shared Cars: ${code}`)
    this.name = 'SharedCarsError'
  }
}

/** Why a car ended for this User. */
export type SharedCarEnding =
  | 'left'
  | 'stopped'
  | 'last_member'
  /** The server said `gone`: removed, or the owner stopped sharing. */
  | 'gone'
  /** Another of the User's devices left (the roster's `leftCars`). */
  | 'left_elsewhere'

/** Why a sync failed, for analytics: a server code or the engine's own. */
export type SharedCarSyncFailure = SpaceErrorCode | SharedCarsErrorCode

/** A key moment, for analytics. Never ids or content. */
export type SharedCarOutcome =
  /** `resumed`: the share stopped part-way and picked up again. */
  | { type: 'shared'; resumed: boolean }
  /** `people`: how many are on the car with the User. */
  | { type: 'joined'; people: number }
  | { type: 'ended'; reason: SharedCarEnding }
  | { type: 'rekeyed' }
  /**
   * A share that stopped part-way gave up for good in the background, by the
   * refusal's code (the User's own Share Car reports its own failure).
   */
  | { type: 'share_failed'; reason: string }
  /** A car's sync (or a step of it) failed, by reason. */
  | { type: 'sync_failed'; reason: SharedCarSyncFailure }

/** How a car's sync went. */
export type CarSyncOutcome =
  | 'synced'
  /**
   * It pulled, but nothing vouches for the car's current key yet: the car
   * waits, and its changes stay here.
   */
  | 'waiting'
  /** Nothing ran: backing off, or a sync already got past `minSeq`. */
  | 'skipped'
  /** The car ended for this User (`gone`), with a personal copy kept. */
  | 'ended'
  /** This device doesn't have the car. */
  | 'missing'

export type CarSyncOptions = {
  /**
   * Started by the app on its own (returning to it, the live signal, a local
   * change), not the User: skipped while the server asked to back off.
   */
  automatic?: boolean
  /** A `hello` past the cursor: a sync that already reached it is enough. */
  minSeq?: number
}

/** The User's own mileage store: read, move a shared car out, add a copy. */
export type PersonalMileage = {
  snapshot: () => MileageSnapshot
  /**
   * Adds records and tombstones keeping their stamps (`useMileage`'s
   * `mergeRecords`): a personal copy, and the deletions of records a Shared Car
   * took over.
   */
  mergeRecords: (records: Partial<MileageSnapshot>) => void
}

/** A car that ended for the User here, for what the app tells them. */
export type SharedCarEnded = {
  spaceId: string
  /** The car's name as it last synced; empty when it had none. */
  name: string
  reason: SharedCarEnding
}

/** A share that gave up for good: the car stayed the User's own. */
export type SharedCarShareFailed = {
  /** The User's own car that was being shared. */
  vehicleId: string
  /** Its name; empty when it had none. */
  name: string
  /** The refusal's code: `too_large`, `limit`, `bad_request`, … */
  reason: string
}

/** An invitation a rekey closed, sent again with the new key. */
export type ReissuedInvite = {
  spaceId: string
  /** The invitation the rekey closed: its `car.invite` is canceled. */
  previousInviteId: string
  /** What the new `car.invite` carries. */
  invite: CarInvitePayload
}

/** A join whose answer was lost, confirmed later: the invitation it used. */
export type SharedCarJoinConfirmed = { spaceId: string; inviteId: string }

/** A car `leaveAll` couldn't leave, which stays on this device. */
export type SharedCarNotLeft = {
  spaceId: string
  /** The car's name as it last synced; empty when it never synced here. */
  name: string
}

export type SharedCarsEngineDeps = {
  client: SpacesClient
  store: SharedCarsStore
  personal: PersonalMileage
  keyring: SpaceKeyring
  /** The account key (the Buddies root seed); null when there's none. */
  rootSeed: () => Promise<Uint8Array | null>
  /** What the User's `member` record says (see `SharedCarProfile`). */
  profile: SharedCarProfileProvider
  /** Where this session's sync status is shown. */
  status?: SharedCarsSessionStore
  randomBytes: (length: number) => Uint8Array
  randomUUID: () => string
  /** Device clock: back-off waits, and when a sync last worked. */
  now: () => number
  /**
   * The synced clock (`syncNow`), the server's near enough: expiries, the
   * roster's times, and how far ahead a stamp may be. The engine rounds it down
   * to whole milliseconds.
   */
  syncNow: () => number
  /** A record's new stamp, past `previous` (`syncTimestamp`). */
  stamp: (previous?: number) => number
  /**
   * Calibrates the synced clock against the server now (`refreshSyncClock({
   * force: true })`), after a put refused a stamp.
   */
  refreshClock?: () => Promise<unknown>
  /**
   * A stamp made before the synced clock was calibrated, as calibrated
   * (`correctedSyncTimestamp`); others unchanged.
   */
  correctStamp?: (stamp: number) => number
  /** Automatic syncs run only while this says so (a session exists). */
  canSync?: () => boolean
  /**
   * When this device last read the Buddies roster (device clock), 0 when it
   * hasn't. Ends a sync still owes the server wait for a read after the last
   * try, since the roster may say the User joined the car again elsewhere.
   * Without it, they don't wait.
   */
  rosterReadAt?: () => number
  onOutcome?: (outcome: SharedCarOutcome) => void
  /**
   * A car the User was on ended here, its copy kept: once per car per device.
   * Unlike `onOutcome`, it names the car, for the User only.
   */
  onCarEnded?: (ended: SharedCarEnded) => void
  /**
   * A share that stopped part-way gave up for good in the background, so the
   * car stayed the User's own: for telling them. The User's own Share Car gets
   * the error instead.
   */
  onShareFailed?: (failed: SharedCarShareFailed) => void
  /** A rekey closed an invitation this device sent; send its replacement. */
  onInviteReissued?: (reissue: ReissuedInvite) => void
  /**
   * A join whose answer was lost turned out, on a later check, to have landed:
   * the invitation it answered is told now.
   */
  onJoinConfirmed?: (joined: SharedCarJoinConfirmed) => void
  /** Something failed that the engine works around; `context` is an op name. */
  onError?: (error: unknown, context: string) => void
}
