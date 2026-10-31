import {
  createLiveSignal,
  type LiveCloseAction,
  type LiveSignal,
  type LiveSignalDeps,
} from '@/lib/liveSignal'

/** The space was deleted, or this member is no longer on it. */
export const SPACE_CLOSE_GONE = 4001
/** A socket past the space's cap opened, and the server closed the oldest. */
export const SPACE_CLOSE_REPLACED = 4002
/**
 * After `4002 "replaced"`, the least wait before connecting again: another of
 * the space's sockets just took this one's place, and coming straight back
 * would only close the next oldest, round and round.
 */
export const SPACE_REPLACED_WAIT_MS = 60 * 1000

/**
 * `gone` stays closed: only a sync says whether the car is still there, and the
 * caller reconnects if it is. Anything else (`replaced` included) reconnects
 * with the backoff Buddies uses.
 */
const spaceCloseAction = (code: number | undefined): LiveCloseAction =>
  code === SPACE_CLOSE_GONE ? 'stay' : 'reconnect'

const spaceReconnectFloor = (code: number | undefined) =>
  code === SPACE_CLOSE_REPLACED ? SPACE_REPLACED_WAIT_MS : 0

export type SpaceLiveDeps = Omit<
  LiveSignalDeps,
  'closeAction' | 'reconnectFloorMs' | 'onChange'
> & {
  /**
   * Something changed on the server; pull it. `seq` is the newest `hello` or
   * `changed` since the last call: a sync already past it needn't run again.
   */
  onChange: (seq?: number) => void
  /**
   * The server closed with `4001 "gone"`: sync, which ends the car if it's
   * gone, and `reconnect()` the signal if it isn't.
   */
  onGone: () => void
}

/**
 * One space's live signal (`GET /spaces/v1/live`, docs/shared-cars-protocol.md,
 * "Live signal"): a `hello` with the space's `seq` after the upgrade, then
 * `changed` after every change that advances it (the writer's own devices hear
 * their writes too), and `pong` for each `ping`. Never any content. The app
 * keeps one per Shared Car while it's in the foreground.
 *
 * Every change to a space advances its `seq`, so a `changed` says how far a
 * sync must reach, as a `hello` does: a device that already put the change
 * itself, with nothing between, doesn't pull it again.
 */
export function createSpaceLive(deps: SpaceLiveDeps): LiveSignal {
  const { onGone, onEvent, onChange, ...signal } = deps
  /** The newest `changed` since the last sync it asked for. */
  let changedSeq: number | undefined
  return createLiveSignal({
    ...signal,
    closeAction: spaceCloseAction,
    reconnectFloorMs: spaceReconnectFloor,
    onChange: (seq) => {
      const upTo =
        changedSeq === undefined ? seq : Math.max(changedSeq, seq ?? changedSeq)
      changedSeq = undefined
      onChange(upTo)
    },
    onEvent: (event) => {
      onEvent?.(event)
      if (event.type === 'changed')
        changedSeq = Math.max(changedSeq ?? event.seq, event.seq)
      if (event.type === 'closed') {
        // A change still waiting went with the connection.
        changedSeq = undefined
        if (event.code === SPACE_CLOSE_GONE) onGone()
      }
    },
  })
}
