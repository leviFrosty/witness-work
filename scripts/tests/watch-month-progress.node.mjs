import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test(
  "the Apple Watch's month progress paces like the phone",
  { skip: process.platform !== 'darwin' },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'ww-watch-test-'))
    try {
      const executable = join(directory, 'watch-month-progress-tests')
      const compile = spawnSync(
        'swiftc',
        [
          'targets/watch/MonthProgress.swift',
          'targets/watch/UpNext.swift',
          'targets/watch/AppLanguage.swift',
          'targets/watch/WatchStorage.swift',
          'targets/watch/WatchStrings.swift',
          'targets/watch/Shared/AppGroup.swift',
          'targets/watch/Shared/WatchProtocol.swift',
          'scripts/tests/watch-month-progress.swift',
          '-o',
          executable,
        ],
        { encoding: 'utf8' }
      )
      assert.equal(compile.status, 0, compile.stderr)
      const result = spawnSync(
        executable,
        ['targets/wear-os/src/test/resources/phone-context.json'],
        { encoding: 'utf8', env: { ...process.env, TZ: 'America/Chicago' } }
      )
      assert.equal(result.status, 0, result.stderr)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
