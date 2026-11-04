import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unstable_readConfig } from 'wrangler'
import {
  WRANGLER_CONFIG,
  buildFrame,
  deployPlan,
  frameAppOrigins,
} from '../web-verify.mjs'

const version = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url))
).version
const keyword = { WW_RELEASE_CONFIRM: `SHIP-PROD-${version}` }
const HEAD = 'b'.repeat(40)
const pushed = {
  clean: true,
  head: HEAD,
  pushed: true,
  onMain: false,
  tags: [],
}
const release = { ...pushed, onMain: true, tags: [`v${version}`] }
const plan = (target, args = ['--dry-run'], env = {}, git = pushed) =>
  deployPlan(target, args, { env, git })

test('dev deploys a pushed commit to ww-verify-dev', () => {
  const dev = plan('dev')
  assert.equal(dev.worker, 'ww-verify-dev')
  assert.equal(dev.host, 'verify-dev.witnesswork.app')
  assert.deepEqual(dev.blocked, [])
  assert.deepEqual(dev.command.slice(1, 6), [
    'deploy',
    '--config',
    WRANGLER_CONFIG,
    '--env',
    'dev',
  ])
  assert.match(dev.credential, /wrangler's own login/)
})

test('dev refuses a commit nobody pushed, or a dirty checkout', () => {
  assert.match(
    plan('dev', ['--dry-run'], {}, { ...pushed, pushed: false }).blocked[0],
    /pushed/
  )
  assert.match(
    plan('dev', ['--dry-run'], {}, { ...pushed, clean: false }).blocked[0],
    /Commit all changes/
  )
})

test('production needs the keyword, even for a dry run, and the release commit', () => {
  assert.throws(() => plan('production'), /SHIP-PROD/)
  assert.throws(
    () =>
      plan('production', ['--dry-run'], {
        WW_RELEASE_CONFIRM: 'SHIP-PROD-0.0.1',
      }),
    /SHIP-PROD/
  )
  assert.equal(
    plan('production', ['--dry-run'], keyword, pushed).blocked.length,
    2
  )
  const ok = plan('production', ['--dry-run'], keyword, release)
  assert.deepEqual(ok.blocked, [])
  assert.equal(ok.worker, 'ww-verify')
  assert.equal(ok.host, 'verify.witnesswork.app')
  assert.match(ok.credential, /1Password app/)
})

test('refuses unknown targets and arguments', () => {
  assert.throws(() => plan('beta'), /Usage/)
  assert.throws(() => plan('dev', ['--force']), /Unknown/)
  assert.throws(() => plan('dev', ['--preview']), /Unknown/)
})

test('each frame is framed by its own environments only', () => {
  assert.deepEqual(frameAppOrigins('dev'), [
    'http://localhost:*',
    'http://127.0.0.1:*',
    'https://app-dev.witnesswork.app',
  ])
  assert.deepEqual(frameAppOrigins('production'), [
    'https://beta.app.witnesswork.app',
    'https://app.witnesswork.app',
  ])
})

test('the wrangler config serves files only, on the frame hosts', () => {
  for (const [env, name, host] of [
    ['dev', 'ww-verify-dev', 'verify-dev.witnesswork.app'],
    ['production', 'ww-verify', 'verify.witnesswork.app'],
  ]) {
    const config = unstable_readConfig({ config: WRANGLER_CONFIG, env })
    assert.equal(config.name, name)
    assert.equal(config.main, undefined)
    assert.deepEqual(config.routes, [{ pattern: host, custom_domain: true }])
    assert.equal(config.workers_dev, false)
    assert.equal(config.preview_urls, false)
  }
})

test('a build carries its origins and headers, and nothing else', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-verify-test-'))
  try {
    await buildFrame('production', out)
    const script = fs.readFileSync(path.join(out, 'frame.js'), 'utf8')
    assert.ok(script.includes('https://app.witnesswork.app'))
    assert.ok(!script.includes('app-dev.witnesswork.app'))
    assert.ok(!script.includes('"http://localhost:*"'))
    assert.ok(script.includes('/turnstile/v0/api.js?render=explicit'))
    // The maps protocol lends only its origin check.
    assert.ok(!script.includes('mapkit'))
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8')
    assert.match(
      headers,
      /frame-ancestors https:\/\/beta\.app\.witnesswork\.app https:\/\/app\.witnesswork\.app;/
    )
    assert.match(
      headers,
      /script-src 'self' https:\/\/challenges\.cloudflare\.com;/
    )
    assert.deepEqual(fs.readdirSync(out).sort(), [
      '_headers',
      'frame.css',
      'frame.js',
      'index.html',
      'robots.txt',
    ])
  } finally {
    fs.rmSync(out, { recursive: true, force: true })
  }
})
