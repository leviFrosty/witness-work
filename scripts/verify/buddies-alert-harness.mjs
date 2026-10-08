#!/usr/bin/env node
// Prints the alert the iOS Notification Service Extension would show for a
// Buddies push, by running the extension's own code inside a booted simulator:
//
//   node scripts/verify/buddies-alert-harness.mjs <simulator udid> <payload.json>
//
// The payload is what `__WW_DEV__.prepareBuddiesPush()` builds (the relay's
// APNs payload for an inbox event). The harness gets the extension's
// entitlements (its Keychain access group and the App Group), so it reads the
// alert snapshot the app wrote and counts its outcome as the extension does.
// Verify builds are always the development variant.
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const BUNDLE_ID = 'com.leviwilkerson.jwtimedev'
const TEAM_ID = 'Y3KE7B7AHJ'
const [udid, payload] = process.argv.slice(2)
if (!udid || !payload) {
  console.error(
    'usage: buddies-alert-harness.mjs <simulator udid> <payload.json>'
  )
  process.exit(2)
}

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(1)
  }
  return result.stdout.trim()
}

const dir = mkdtempSync(join(tmpdir(), 'ww-alert-harness-'))
try {
  const entitlements = join(dir, 'entitlements.plist')
  writeFileSync(
    entitlements,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>application-identifier</key><string>${TEAM_ID}.${BUNDLE_ID}.notifications</string>
  <key>keychain-access-groups</key><array><string>${TEAM_ID}.${BUNDLE_ID}.buddies-alerts</string></array>
  <key>com.apple.security.application-groups</key><array><string>group.${BUNDLE_ID}</string></array>
</dict></plist>
`
  )
  const target = join(ROOT, 'targets/notification-service')
  const binary = join(dir, 'harness')
  run('xcrun', [
    '-sdk',
    'iphonesimulator',
    'swiftc',
    '-target',
    'arm64-apple-ios17.0-simulator',
    '-module-name',
    'notifications',
    ...[
      'BuddiesAlerts.swift',
      'BuddiesAlertText.swift',
      'BuddiesInboxFetch.swift',
      'NotificationService.swift',
    ].map((file) => join(target, file)),
    join(ROOT, 'scripts/verify/buddies-alert-harness/main.swift'),
    '-o',
    binary,
    ...['-sectcreate', '__TEXT', '__entitlements', entitlements].flatMap(
      (arg) => ['-Xlinker', arg]
    ),
  ])
  run('codesign', ['-s', '-', '-f', binary])
  // Inside a copy of the installed extension, so its bundle id and string
  // catalogs are the ones the extension runs with.
  const app = run('xcrun', [
    'simctl',
    'get_app_container',
    udid,
    BUNDLE_ID,
    'app',
  ])
  const bundle = join(dir, 'notifications.appex')
  cpSync(join(app, 'PlugIns/notifications.appex'), bundle, { recursive: true })
  cpSync(binary, join(bundle, 'harness'))
  console.log(
    run('xcrun', [
      'simctl',
      'spawn',
      udid,
      join(bundle, 'harness'),
      resolve(payload),
    ])
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
