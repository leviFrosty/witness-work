import {
  createLiveSignal,
  type LiveCloseAction,
  type LiveSignalDeps,
} from '@/lib/liveSignal'

export type { LiveEvent } from '@/lib/liveSignal'

const CLOSE_GONE = 4001

const CLOSE_SUSPENDED = 4003

const inboxCloseAction = (code: number | undefined): LiveCloseAction =>
  code === CLOSE_GONE
    ? 'sync'
    : code === CLOSE_SUSPENDED
      ? 'syncAndStay'
      : 'reconnect'

export type LiveInboxDeps = Omit<LiveSignalDeps, 'closeAction'>

export function createLiveInbox(deps: LiveInboxDeps) {
  return createLiveSignal({ ...deps, closeAction: inboxCloseAction })
}
