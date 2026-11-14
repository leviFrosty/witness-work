import { makeMutable } from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'
import { counters, now, perf } from '@/lib/perf'
import { reportPerf } from '@/lib/perfProbe'

const AFTER_INTRO_MS = 26_000
const MAX_MS = 75_000
const POLL_MS = 100

type FrameTrace = {
  start: number
  deltas: number[]
}

export type WelcomePerfResult = {
  marks: Record<string, number>
  ui: FrameTrace
  js: FrameTrace
  counters: Record<string, number>
  heap: { heapSize: number; numGCs: number } | null
}

function recordUiFrames(until: { value: number }): Promise<FrameTrace> {
  return new Promise((resolve) => {
    const finish = (trace: FrameTrace) => resolve(trace)
    scheduleOnUI(() => {
      'worklet'
      const deltas: number[] = []
      let last = -1
      let begin = -1
      const tick = (timestamp: number) => {
        const nowWall = Date.now()
        if (begin < 0) begin = nowWall
        if (last >= 0) deltas.push(Math.round((timestamp - last) * 100))
        last = timestamp
        if (nowWall < until.value) requestAnimationFrame(tick)
        else scheduleOnRN(finish, { start: begin, deltas })
      }
      requestAnimationFrame(tick)
    })
  })
}

function recordJsFrames(until: { value: number }): Promise<FrameTrace> {
  return new Promise((resolve) => {
    const deltas: number[] = []
    let last = -1
    let begin = -1
    const tick = (timestamp: number) => {
      const nowWall = Date.now()
      if (begin < 0) begin = nowWall
      if (last >= 0) deltas.push(Math.round((timestamp - last) * 100))
      last = timestamp
      if (nowWall < until.value) requestAnimationFrame(tick)
      else resolve({ start: begin, deltas })
    }
    requestAnimationFrame(tick)
  })
}

function heap() {
  const stats = (
    globalThis as {
      HermesInternal?: { getInstrumentedStats?: () => Record<string, number> }
    }
  ).HermesInternal?.getInstrumentedStats?.()
  return stats ? { heapSize: stats.js_heapSize, numGCs: stats.js_numGCs } : null
}

export function runPerfWelcome() {
  const origin = { wall: Date.now(), perf: now() }
  const until = makeMutable(origin.wall + MAX_MS)
  const wallMarks = () => {
    const marks: Record<string, number> = {}
    for (const [name, at] of Object.entries(perf.snapshot().marks))
      marks[name] = Math.round(origin.wall + (at - origin.perf))
    return marks
  }
  const store = globalThis as { __wwPerfWelcome?: unknown }
  store.__wwPerfWelcome = { state: 'recording' }

  const ui = recordUiFrames(until)
  const js = recordJsFrames(until)

  const poll = setInterval(() => {
    if (perf.snapshot().marks['welcome:done'] === undefined) return
    clearInterval(poll)
    until.value = Math.min(until.value, Date.now() + AFTER_INTRO_MS)
    const marks = wallMarks()
    store.__wwPerfWelcome = { state: 'intro-done', marks }
    reportPerf({ type: 'welcome-ready', at: Date.now(), marks })
  }, POLL_MS)

  void Promise.all([ui, js]).then(([uiTrace, jsTrace]) => {
    clearInterval(poll)
    const result: WelcomePerfResult = {
      marks: wallMarks(),
      ui: uiTrace,
      js: jsTrace,
      counters: { ...counters },
      heap: heap(),
    }
    store.__wwPerfWelcome = { state: 'done', ...result }
    reportPerf({ type: 'welcome', at: Date.now(), ...result })
  })
}
