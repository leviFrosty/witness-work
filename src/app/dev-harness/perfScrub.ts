import { CommonActions } from '@react-navigation/native'
import { Dimensions } from 'react-native'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'
import { counters } from '@/lib/perf'
import { reportPerf } from '@/lib/perfProbe'
import { navigationRef } from '@/features/contacts/lib/linking'

const SETTLE_MS = 5000
const WINDOW_MS = 20000
const BETWEEN_ROUNDS_MS = 3000

type FrameTrace = {
  start: number
  wall: number[]
  deltas: number[]
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

function recordUiFrames(windowMs: number): Promise<FrameTrace> {
  return new Promise((resolve) => {
    const finish = (trace: FrameTrace) => resolve(trace)
    scheduleOnUI(() => {
      'worklet'
      const wall: number[] = []
      const deltas: number[] = []
      let last = -1
      let begin = -1
      const tick = (timestamp: number) => {
        const nowWall = Date.now()
        if (begin < 0) begin = nowWall
        if (last >= 0) {
          deltas.push(Math.round((timestamp - last) * 100))
          wall.push(nowWall - begin)
        }
        last = timestamp
        if (nowWall - begin < windowMs) requestAnimationFrame(tick)
        else scheduleOnRN(finish, { start: begin, wall, deltas })
      }
      requestAnimationFrame(tick)
    })
  })
}

function recordJsFrames(windowMs: number): Promise<FrameTrace> {
  return new Promise((resolve) => {
    const wall: number[] = []
    const deltas: number[] = []
    let last = -1
    let begin = -1
    const tick = (timestamp: number) => {
      const nowWall = Date.now()
      if (begin < 0) begin = nowWall
      if (last >= 0) {
        deltas.push(Math.round((timestamp - last) * 100))
        wall.push(nowWall - begin)
      }
      last = timestamp
      if (nowWall - begin < windowMs) requestAnimationFrame(tick)
      else resolve({ start: begin, wall, deltas })
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

const snapshotCounters = () => ({ ...counters })

function counterDelta(
  after: Record<string, number>,
  before: Record<string, number>
) {
  const delta: Record<string, number> = {}
  for (const [key, value] of Object.entries(after)) {
    const change = value - (before[key] ?? 0)
    if (change) delta[key] = change
  }
  return delta
}

export async function runPerfScrub(ready: () => boolean) {
  while (!ready() || !navigationRef.isReady()) await sleep(250)
  await sleep(1500)
  navigationRef.dispatch(CommonActions.navigate({ name: 'Schedule' }))
  await sleep(SETTLE_MS)
  const { width, height } = Dimensions.get('window')
  const today = new Date()
  const show = (offset: number) => {
    const month = new Date(today.getFullYear(), today.getMonth() + offset, 1)
    navigationRef.dispatch(
      CommonActions.navigate({
        name: 'Schedule',
        params: { year: month.getFullYear(), month: month.getMonth() },
      })
    )
  }
  for (let round = 0; ; round++) {
    show(-1)
    await sleep(800)
    show(0)
    await sleep(1500)
    const before = snapshotCounters()
    const heapBefore = heap()
    reportPerf({
      type: 'scrub-ready',
      at: Date.now(),
      round,
      windowMs: WINDOW_MS,
      window: { width, height },
    })
    const [ui, js] = await Promise.all([
      recordUiFrames(WINDOW_MS),
      recordJsFrames(WINDOW_MS),
    ])
    reportPerf({
      type: 'scrub',
      at: Date.now(),
      round,
      ui,
      js,
      counters: counterDelta(snapshotCounters(), before),
      heapBefore,
      heapAfter: heap(),
    })
    await sleep(BETWEEN_ROUNDS_MS)
  }
}
