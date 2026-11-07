import {
  replayAllowed,
  type ReplayGateInput,
} from '@/lib/sessionReplay/replayGate'

export type ReplayRecorder = {
  start: () => void

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
      if (!ready || !running || started || !isOpen()) return
      started = true
      ready.start()
    })
  }

  return { evaluate, isOpen, isRunning: () => running }
}
