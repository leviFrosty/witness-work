// Pure helpers for scripts/perf: reading `[ww-perf]` log lines, per-run
// metrics, summaries, the markdown report and before/after comparisons.

/**
 * Reassembles `[ww-perf]` reports from device log messages. A report too long
 * for one log line (os_log and logcat truncate around 1 KB and 4 KB) arrives as
 * `[ww-perf~<id>:<i>/<n>] <slice>` parts (src/lib/perfProbe.ts).
 */
export function createPerfReader() {
  const parts = new Map()
  return (message) => {
    const whole = message.match(/\[ww-perf\] (\{.*\})\s*$/)
    if (whole) return safeJson(whole[1])
    const part = message.match(/\[ww-perf~(\w+):(\d+)\/(\d+)\] (.*?)\r?$/)
    if (!part) return null
    const [, id, index, total, slice] = part
    const slices = parts.get(id) ?? []
    slices[Number(index) - 1] = slice
    parts.set(id, slices)
    const count = slices.filter((s) => s !== undefined).length
    if (count < Number(total)) return null
    parts.delete(id)
    return safeJson(slices.join(''))
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Linear interpolation between order statistics (numpy's default). */
export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  const rank = (sorted.length - 1) * p
  const low = Math.floor(rank)
  const high = Math.ceil(rank)
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

const round = (value, digits = 1) =>
  value === null || value === undefined
    ? null
    : Math.round(value * 10 ** digits) / 10 ** digits

export function describe(values) {
  const finite = values.filter(Number.isFinite)
  if (!finite.length) return null
  return {
    n: finite.length,
    median: round(percentile(finite, 0.5)),
    p90: round(percentile(finite, 0.9)),
    min: round(Math.min(...finite)),
    max: round(Math.max(...finite)),
    mean: round(finite.reduce((sum, v) => sum + v, 0) / finite.length),
  }
}

const span = (from, to) =>
  Number.isFinite(from) && Number.isFinite(to) ? to - from : null

/**
 * One cold launch's metrics, in ms unless named otherwise. `launchWall` is the
 * runner's wall clock at the launch command (iOS) or the system's START log
 * line (Android), on the same clock as the app's `Date.now()`.
 */
export function launchMetrics(report, extra = {}) {
  const marks = report.marks ?? {}
  const startup = report.startup ?? {}
  const bundleStart = startup.executeJavaScriptBundleEntryPointStart
  const endToEndMs = span(extra.launchWall, report.wallNavReady)
  const bundleToReadyMs = span(bundleStart, marks.navReady)
  return {
    endToEndMs,
    // RN 0.86's startup.startTime marks runtime init, not process start, so
    // the native time before JS is what end to end leaves after it.
    preJsMs: span(bundleToReadyMs, endToEndMs),
    bundleToReadyMs,
    bundleToInitializeMs: span(bundleStart, marks.initializeApp),
    initializeToFirstRenderMs: span(marks.initializeApp, marks.appFirstRender),
    firstRenderToTreeMs: span(marks.appFirstRender, marks.appTreeRender),
    treeToReadyMs: span(marks.appTreeRender, marks.navReady),
    blockedMsAfterReady: report.blockedMsAfterReady ?? null,
    netRequests: report.counters?.['net:total'] ?? 0,
    jsHeapMb: report.jsHeap?.heapSize ? report.jsHeap.heapSize / 2 ** 20 : null,
    rssMb: extra.rssKb ? extra.rssKb / 1024 : null,
    androidTotalTimeMs: extra.totalTimeMs ?? null,
    iosLaunchCommandMs: extra.launchCommandMs ?? null,
  }
}

/** Median (and p90) of every metric, plus each counter's median. */
export function summarizeLaunches(runs) {
  const metrics = {}
  for (const key of Object.keys(runs[0]?.metrics ?? {})) {
    const stats = describe(runs.map((r) => r.metrics[key]))
    if (stats) metrics[key] = stats
  }
  return {
    metrics,
    counters: medianCounters(runs.map((r) => r.report.counters ?? {})),
    countersAfterReady: medianCounters(
      runs.map((r) => r.report.countersAfterReady ?? {})
    ),
  }
}

/** Foreground or inactive cycles: blocking, plus each counter's deltas. */
export function summarizeCycles(cycles) {
  return {
    blockedMs: describe(cycles.map((c) => c.report.blockedMs)),
    counters: medianCounters(cycles.map((c) => c.report.counters ?? {})),
    perCycle: cycles.map((c) => c.report.counters ?? {}),
  }
}

export function medianCounters(list) {
  const keys = [...new Set(list.flatMap((c) => Object.keys(c)))].sort()
  return Object.fromEntries(
    keys.map((key) => [
      key,
      round(
        percentile(
          list.map((c) => c[key] ?? 0),
          0.5
        )
      ),
    ])
  )
}

// ---------- reports ----------

export const METRIC_LABELS = {
  endToEndMs: 'Launch to first screen (end to end)',
  preJsMs: 'Launch to bundle start (native, before JS)',
  bundleToReadyMs: 'Bundle start to first screen',
  bundleToInitializeMs: 'Bundle start to initializeApp',
  initializeToFirstRenderMs: 'initializeApp to App render',
  firstRenderToTreeMs: 'App render to tree render',
  treeToReadyMs: 'Tree render to navigation ready',
  blockedMsAfterReady: 'JS blocked in 8 s after first screen',
  netRequests: 'Network requests by 8 s after first screen',
  jsHeapMb: 'JS heap after launch (MB)',
  rssMb: 'RSS after launch (MB)',
  androidTotalTimeMs: 'Android TotalTime (am start -W)',
  iosLaunchCommandMs: 'iOS simctl launch command',
}

/** Counters worth a row in the foreground table even when they stay at 0. */
export const KEY_COUNTERS = [
  'net:total',
  'sync:push',
  'sync:pull',
  'sync:catchUp',
  'reminders:schedule',
  'reminders:cancel',
  'widget:push',
  'widget:reload',
  'watch:push',
  'calendar:run',
  'flags:reload',
  'buddies:sync',
  'prefs:set',
  'account:reconcile',
  'rc:identify',
  'render:App',
  'render:Home',
]

const fmt = (value) => (value === null || value === undefined ? '–' : value)

function counterRows(counters) {
  const keys = [
    ...KEY_COUNTERS,
    ...Object.keys(counters)
      .filter((k) => !KEY_COUNTERS.includes(k))
      .sort(),
  ]
  return keys.map((key) => `| \`${key}\` | ${fmt(counters[key] ?? 0)} |`)
}

/** The markdown summary of one result file. */
export function renderMarkdown(result) {
  const lines = [
    `# Perf baseline: \`${result.ref}\` (${result.sha.slice(0, 12)})`,
    '',
    `Captured ${result.capturedAt} with \`${result.command}\`. See [README](./README.md) for what each number means.`,
    '',
  ]
  for (const [platform, data] of Object.entries(result.platforms)) {
    lines.push(
      `## ${platform === 'ios' ? 'iOS' : 'Android'} (${data.device})`,
      ''
    )
    lines.push(
      `${data.launch.runs.filter((r) => !r.discarded).length} cold launches measured (after ${data.launch.discarded} discarded warm-up); machine load ${describeConditions(data)}.`,
      ''
    )
    lines.push(
      '| Cold launch | median | p90 | min | max |',
      '|---|---|---|---|---|'
    )
    for (const [key, stats] of Object.entries(data.launch.summary.metrics))
      lines.push(
        `| ${METRIC_LABELS[key] ?? key} | ${stats.median} | ${stats.p90} | ${stats.min} | ${stats.max} |`
      )
    lines.push(
      '',
      '<details><summary>Launch counters (median per launch)</summary>',
      ''
    )
    lines.push('| Counter | median |', '|---|---|')
    lines.push(...counterRows(data.launch.summary.counters))
    lines.push('', '</details>', '')
    for (const [kind, title] of [
      ['foreground', 'Foreground (background 5 s, then return)'],
      ['active', 'Inactive blip'],
    ]) {
      const cycles = data[kind]
      if (!cycles) continue
      if (cycles.skipped) {
        lines.push(`### ${title}`, '', `Not measured: ${cycles.skipped}`, '')
        continue
      }
      lines.push(`### ${title}`, '')
      lines.push(
        `${cycles.cycles.length} cycles; JS blocked in the 8 s after return: median ${fmt(cycles.summary.blockedMs?.median)} ms, p90 ${fmt(cycles.summary.blockedMs?.p90)} ms.`,
        ''
      )
      lines.push('| Counter (delta per cycle) | median |', '|---|---|')
      lines.push(...counterRows(cycles.summary.counters))
      lines.push('')
    }
    if (data.setup) {
      lines.push(
        '### Setup',
        '',
        `Seeded \`${data.setup.scenario}\`; notifications ${data.setup.notifications}, Calendar Sync ${data.setup.calendar}, Buddies inbox ${data.setup.buddies}.`,
        ''
      )
    }
  }
  if (result.static) {
    lines.push('## Bundle', '')
    lines.push(
      '| Platform | JS (minified) | Hermes bytecode | Embedded bytecode (probe build) | Modules |',
      '|---|---|---|---|---|'
    )
    for (const [platform, s] of Object.entries(result.static))
      lines.push(
        `| ${platform} | ${kb(s.jsBytes)} | ${kb(s.hbcBytes)} | ${kb(s.embeddedHbcBytes)} | ${fmt(s.modules)} |`
      )
    lines.push('')
  }
  return lines.join('\n')
}

const kb = (bytes) => (bytes ? `${Math.round(bytes / 1024)} KB` : '–')

function describeConditions(data) {
  const load = data.launch.runs.map((r) => r.conditions?.load1)
  const free = data.launch.runs.map((r) => r.conditions?.memoryFreePct)
  const others = data.launch.runs.map((r) => r.conditions?.otherDevices ?? 0)
  return `1-min average ${fmt(round(percentile(load, 0.5), 2))} (max ${fmt(round(Math.max(...load.filter(Number.isFinite)), 2))}), ${fmt(round(percentile(free, 0.5), 0))}% memory free, ${Math.max(...others)} other leased devices`
}

// ---------- compare ----------

/** Rows comparing two results: medians before and after, and the change. */
export function compareResults(before, after) {
  const rows = []
  const platforms = Object.keys(before.platforms).filter(
    (p) => after.platforms[p]
  )
  for (const platform of platforms) {
    const a = before.platforms[platform]
    const b = after.platforms[platform]
    for (const key of Object.keys(METRIC_LABELS)) {
      const x = a.launch.summary.metrics[key]
      const y = b.launch.summary.metrics[key]
      if (!x && !y) continue
      rows.push(
        row(
          platform,
          'launch',
          METRIC_LABELS[key],
          x?.median,
          y?.median,
          x?.p90,
          y?.p90
        )
      )
    }
    for (const kind of ['foreground', 'active']) {
      const x = a[kind]?.summary
      const y = b[kind]?.summary
      if (!x || !y) continue
      rows.push(
        row(
          platform,
          kind,
          'JS blocked (ms)',
          x.blockedMs?.median,
          y.blockedMs?.median,
          x.blockedMs?.p90,
          y.blockedMs?.p90
        )
      )
      const keys = [
        ...new Set([...Object.keys(x.counters), ...Object.keys(y.counters)]),
      ]
      for (const key of keys.sort())
        rows.push(
          row(platform, kind, key, x.counters[key] ?? 0, y.counters[key] ?? 0)
        )
    }
    const keys = [
      ...new Set([
        ...Object.keys(a.launch.summary.counters),
        ...Object.keys(b.launch.summary.counters),
      ]),
    ].sort()
    for (const key of keys)
      rows.push(
        row(
          platform,
          'launch counters',
          key,
          a.launch.summary.counters[key] ?? 0,
          b.launch.summary.counters[key] ?? 0
        )
      )
  }
  for (const platform of Object.keys(before.static ?? {})) {
    const x = before.static[platform]
    const y = after.static?.[platform]
    if (!y) continue
    for (const key of ['jsBytes', 'hbcBytes', 'embeddedHbcBytes', 'modules'])
      rows.push(row(platform, 'bundle', key, x[key], y[key]))
  }
  return rows
}

function row(platform, group, metric, before, after, beforeP90, afterP90) {
  const delta =
    Number.isFinite(before) && Number.isFinite(after) ? after - before : null
  const pct =
    delta !== null && before ? Math.round((delta / before) * 1000) / 10 : null
  return {
    platform,
    group,
    metric,
    before: before ?? null,
    after: after ?? null,
    delta: round(delta),
    pct,
    beforeP90: beforeP90 ?? null,
    afterP90: afterP90 ?? null,
  }
}

export function renderComparison(before, after, rows, { all = false } = {}) {
  const shown = all
    ? rows
    : rows.filter((r) => r.group !== 'launch counters' || r.delta)
  const lines = [
    `# ${before.ref} (${before.sha.slice(0, 12)}) → ${after.ref} (${after.sha.slice(0, 12)})`,
    '',
    '| Platform | Group | Metric | Before | After | Change | p90 before → after |',
    '|---|---|---|---|---|---|---|',
  ]
  for (const r of shown)
    lines.push(
      `| ${r.platform} | ${r.group} | ${r.metric} | ${fmt(r.before)} | ${fmt(r.after)} | ${r.delta === null ? '–' : `${r.delta > 0 ? '+' : ''}${r.delta}${r.pct === null ? '' : ` (${r.pct > 0 ? '+' : ''}${r.pct}%)`}`} | ${r.beforeP90 === null ? '' : `${r.beforeP90} → ${fmt(r.afterP90)}`} |`
    )
  return lines.join('\n')
}
