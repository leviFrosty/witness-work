import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const days = [
  ['America/New_York', '2026-11-01', 25],
  ['America/New_York', '2026-03-08', 23],
  ['Europe/London', '2026-10-25', 25],
  ['Australia/Sydney', '2026-10-04', 23],
  ['America/Havana', '2026-03-08', 23],
  ['America/Havana', '2026-11-01', 25],
  ['America/Santiago', '2026-09-06', 23],
  ['Asia/Tokyo', '2026-11-01', 24],
]

function build(directory, name, sources) {
  const executable = join(directory, name)
  const compile = spawnSync('swiftc', [...sources, '-o', executable], {
    encoding: 'utf8',
  })
  assert.equal(compile.status, 0, compile.stderr)
  return executable
}

function run(executable, zone, args) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    env: { ...process.env, TZ: zone },
  })
  assert.equal(result.status, 0, result.stderr)
}

test(
  'the Apple Watch and iPhone widgets keep wall-clock days when clocks change',
  { skip: process.platform !== 'darwin' },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'ww-dst-test-'))
    try {
      const watch = build(directory, 'watch-dst-tests', [
        'targets/watch/MonthProgress.swift',
        'targets/watch/UpNext.swift',
        'targets/watch/AppLanguage.swift',
        'targets/watch/WatchStorage.swift',
        'targets/watch/WatchStrings.swift',
        'targets/watch/Shared/AppGroup.swift',
        'targets/watch/Shared/WatchProtocol.swift',
        'scripts/tests/watch-dst.swift',
      ])
      const widgets = build(directory, 'widgets-dst-tests', [
        'targets/widgets/Snapshot.swift',
        'targets/widgets/SnapshotDay.swift',
        'targets/widgets/Shared/AppLanguage.swift',
        'scripts/tests/widgets-dst.swift',
      ])
      for (const [zone, day, hours] of days) {
        run(watch, zone, [
          day,
          String(hours),
          'targets/wear-os/src/test/resources/phone-context.json',
        ])
        run(widgets, zone, [day])
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
