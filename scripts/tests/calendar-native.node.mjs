import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test(
  'native calendar ownership survives crashes and transfers exclusively',
  { skip: process.platform !== 'darwin' },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'ww-calendar-test-'))
    try {
      const executable = join(directory, 'ownership-tests')
      const compile = spawnSync(
        'swiftc',
        [
          'modules/calendar-bridge/ios/CalendarPublishingState.swift',
          'scripts/tests/calendar-publishing.swift',
          '-o',
          executable,
        ],
        { encoding: 'utf8' }
      )
      assert.equal(compile.status, 0, compile.stderr)
      const result = spawnSync(executable, [], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
