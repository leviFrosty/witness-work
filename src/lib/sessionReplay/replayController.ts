import {
  replayAllowed,
  type ReplayGateInput,
} from '@/lib/sessionReplay/replayGate'

/**
 * Starts and stops the recorder as the gate opens and closes (ADR 0043). The
 * recorder is loaded only when a session is sampled and the gate first opens,
 * so most sessions never download it.
 */

export type ReplayRecorder = {
  start: () => void
  /** Stops recording and drops anything still buffered or stored. */
  stop: () => void
}

type Deps = {
  inputs: () => ReplayGateInput
  load: () => Promise<ReplayRecorder>
}

export function createReplayController({ inputs, load }: Deps) {
  let recorder: ReplayRecorder | null = null
  let loading: Promise<ReplayRecorder | null> | null = null
  let running = false
  let started = false

  /** The live answer; the recorder asks it before every send. */
  const isOpen = () => replayAllowed(inputs())

  const recorderReady = () => {
    if (recorder) return Promise.resolve(recorder)
    loading ??= load()
      .then((loaded) => (recorder = loaded))
      .catch(() => null)
      .finally(() => {
        loading = null
      })
    return loading
  }

  const evaluate = () => {
    const open = isOpen()
    if (open === running) return
    running = open
    if (!open) {
      if (started) recorder?.stop()
      started = false
      return
    }
    void recorderReady().then((ready) => {
      // The gate may have closed, or closed and opened again, while it loaded.
      if (!ready || !running || started || !isOpen()) return
      started = true
      ready.start()
    })
  }

  return { evaluate, isOpen, isRunning: () => running }
}
