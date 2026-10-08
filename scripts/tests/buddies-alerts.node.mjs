import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const target = 'targets/notification-service'

test(
  'the Notification Service Extension opens and words Buddies alerts as the app does',
  { skip: process.platform !== 'darwin' },
  () => {
    const directory = mkdtempSync(join(tmpdir(), 'ww-buddies-alerts-'))
    try {
      const executable = join(directory, 'buddies-alerts')
      const compile = spawnSync(
        'swiftc',
        [
          `${target}/BuddiesAlerts.swift`,
          `${target}/BuddiesAlertText.swift`,
          `${target}/BuddiesInboxFetch.swift`,
          'scripts/tests/buddies-alerts.swift',
          '-o',
          executable,
        ],
        { encoding: 'utf8' }
      )
      assert.equal(compile.status, 0, compile.stderr)
      const result = spawnSync(
        executable,
        [
          'src/features/buddies/lib/testing/cryptoVectors.json',
          'src/features/buddies/lib/testing/alertVectors.json',
          'src/locales/en-US.json',
        ],
        { encoding: 'utf8' }
      )
      assert.equal(result.status, 0, result.stderr + result.stdout)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
)
