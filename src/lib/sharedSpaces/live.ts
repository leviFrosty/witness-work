import {
  createLiveSignal,
  type LiveCloseAction,
  type LiveSignal,
  type LiveSignalDeps,
} from '@/lib/liveSignal'

export const SPACE_CLOSE_GONE = 4001

export const SPACE_CLOSE_REPLACED = 4002

export const SPACE_REPLACED_WAIT_MS = 60 * 1000

const spaceCloseAction = (code: number | undefined): LiveCloseAction =>
  code === SPACE_CLOSE_GONE ? 'stay' : 'reconnect'

const spaceReconnectFloor = (code: number | undefined) =>
  code === SPACE_CLOSE_REPLACED ? SPACE_REPLACED_WAIT_MS : 0

export type SpaceLiveDeps = Omit<
  LiveSignalDeps,
  'closeAction' | 'reconnectFloorMs' | 'onChange'
> & {
  onChange: (seq?: number) => void

  onGone: () => void
}

export function createSpaceLive(deps: SpaceLiveDeps): LiveSignal {
  const { onGone, onEvent, onChange, ...signal } = deps

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
        changedSeq = undefined
        if (event.code === SPACE_CLOSE_GONE) onGone()
      }
    },
  })
}
