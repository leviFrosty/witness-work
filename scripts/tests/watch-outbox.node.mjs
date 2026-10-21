import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

test(
  'the Apple Watch reports an entry the iPhone refused',
  { skip: process.platform !== 'darwin' },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'ww-watch-test-'))
    try {
      const executable = join(directory, 'watch-outbox-tests')
      const compile = spawnSync(
        'swiftc',
        [
          'targets/watch/WatchStorage.swift',
          'targets/watch/Shared/AppGroup.swift',
          'targets/watch/Shared/WatchProtocol.swift',
          'scripts/tests/watch-outbox.swift',
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
