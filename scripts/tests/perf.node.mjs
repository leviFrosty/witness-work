import assert from 'node:assert/strict'
import test from 'node:test'
import {
  compareResults,
  createPerfReader,
  describe,
  launchMetrics,
  percentile,
  renderComparison,
  renderMarkdown,
  summarizeCycles,
  summarizeLaunches,
} from '../perf/stats.mjs'

test('percentiles interpolate between order statistics', () => {
  assert.equal(percentile([3, 1, 2], 0.5), 2)
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5)
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9), 91)
  assert.equal(percentile([5, null, Number.NaN], 0.9), 5)
  assert.equal(percentile([], 0.5), null)
  assert.deepEqual(describe([4, 2, 9]), {
    n: 3,
    median: 4,
    p90: 8,
    min: 2,
    max: 9,
    mean: 5,
  })
  assert.equal(describe([null, undefined]), null)
})

test('the reader takes whole reports, reassembles parts and skips noise', () => {
  const read = createPerfReader()
  assert.deepEqual(read('[ww-perf] {"type":"launch"}'), { type: 'launch' })
  assert.equal(read('Running "main" with {"rootTag":1}'), null)
  assert.equal(read('[ww-perf] {broken'), null)
  assert.equal(read('[ww-perf~ab12:2/2] "x":1}'), null)
  assert.deepEqual(read('[ww-perf~ab12:1/2] {"type":"a",'), {
    type: 'a',
    x: 1,
  })
})

const launchReport = (offset = 0) => ({
  type: 'launch',
  wallNavReady: 10_900 + offset,
  blockedMsAfterReady: 120 + offset,
  marks: {
    initializeApp: 400,
    appFirstRender: 450,
    appTreeRender: 500,
    navReady: 700 + offset,
  },
  startup: {
    startTime: 100,
    executeJavaScriptBundleEntryPointStart: 300,
  },
  counters: { 'net:total': 4, 'calendar:run': 1 },
  countersAfterReady: { 'net:total': 2 },
  jsHeap: { heapSize: 8 * 2 ** 20 },
})

test('launch metrics split the launch into its phases', () => {
  assert.deepEqual(
    launchMetrics(launchReport(), {
      launchWall: 10_000,
      rssKb: 204_800,
      totalTimeMs: 650,
      launchCommandMs: 80,
    }),
    {
      endToEndMs: 900,
      preJsMs: 500,
      bundleToReadyMs: 400,
      bundleToInitializeMs: 100,
      initializeToFirstRenderMs: 50,
      firstRenderToTreeMs: 50,
      treeToReadyMs: 200,
      blockedMsAfterReady: 120,
      netRequests: 4,
      jsHeapMb: 8,
      rssMb: 200,
      androidTotalTimeMs: 650,
      iosLaunchCommandMs: 80,
    }
  )
  const bare = launchMetrics({ type: 'launch', marks: {}, startup: null }, {})
  assert.equal(bare.endToEndMs, null)
  assert.equal(bare.preJsMs, null)
  assert.equal(bare.netRequests, 0)
})

function result(sha, offset) {
  const runs = [0, 10, 20].map((o) => {
    const report = launchReport(o + offset)
    return { report, metrics: launchMetrics(report, { launchWall: 10_000 }) }
  })
  const cycles = [
    {
      report: {
        blockedMs: 30 + offset,
        counters: { 'net:total': 2, 'buddies:sync': 1 },
      },
    },
  ]
  return {
    ref: sha,
    sha: `${sha}0000000000000`,
    capturedAt: '2026-10-08T00:00:00.000Z',
    command: 'node scripts/perf/run.mjs',
    static: {
      ios: {
        jsBytes: 4_000_000 + offset,
        hbcBytes: 3_000_000,
        embeddedHbcBytes: 3_100_000,
        modules: 2500,
      },
    },
    platforms: {
      ios: {
        device: 'WW Verify iPhone 1',
        setup: {
          scenario: 'busy',
          notifications: 'granted',
          calendar: 'error: x',
          buddies: 'ok',
        },
        launch: { runs, discarded: 1, summary: summarizeLaunches(runs) },
        foreground: { cycles, summary: summarizeCycles(cycles) },
        active: { skipped: 'not triggerable' },
      },
    },
  }
}

test('summaries, the report and the comparison agree', () => {
  const before = result('aaa', 0)
  const after = result('bbb', -100)
  const summary = before.platforms.ios.launch.summary
  assert.equal(summary.metrics.endToEndMs.median, 910)
  assert.equal(summary.counters['calendar:run'], 1)
  assert.equal(
    before.platforms.ios.foreground.summary.counters['buddies:sync'],
    1
  )

  const markdown = renderMarkdown(before)
  assert.match(markdown, /\| Launch to first screen \(end to end\) \| 910 \|/)
  assert.match(markdown, /Not measured: not triggerable/)
  assert.match(markdown, /\| ios \| 3906 KB \|/)

  const rows = compareResults(before, after)
  const e2e = rows.find(
    (r) => r.metric === 'Launch to first screen (end to end)'
  )
  assert.deepEqual(
    [e2e.before, e2e.after, e2e.delta, e2e.pct],
    [910, 810, -100, -11]
  )
  const blocked = rows.find(
    (r) => r.group === 'foreground' && r.metric === 'JS blocked (ms)'
  )
  assert.equal(blocked.delta, -100)
  const table = renderComparison(before, after, rows)
  assert.match(
    table,
    /\| ios \| launch \| Launch to first screen \(end to end\) \| 910 \| 810 \| -100 \(-11%\) \|/
  )
  assert.doesNotMatch(table, /launch counters \| calendar:run/)
  assert.match(
    renderComparison(before, after, rows, { all: true }),
    /launch counters \| calendar:run/
  )
})
