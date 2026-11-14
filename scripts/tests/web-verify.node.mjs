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

test('beta deploys a pushed commit to ww-verify-beta', () => {
  const beta = plan('beta')
  assert.equal(beta.worker, 'ww-verify-beta')
  assert.equal(beta.host, 'verify-beta.witnesswork.app')
  assert.deepEqual(beta.blocked, [])
  assert.deepEqual(beta.command.slice(1, 6), [
    'deploy',
    '--config',
    WRANGLER_CONFIG,
    '--env',
    'beta',
  ])
  assert.match(beta.credential, /wrangler's own login/)
})

test('beta refuses a commit nobody pushed, or a dirty checkout', () => {
  assert.match(
    plan('beta', ['--dry-run'], {}, { ...pushed, pushed: false }).blocked[0],
    /pushed/
  )
  assert.match(
    plan('beta', ['--dry-run'], {}, { ...pushed, clean: false }).blocked[0],
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
  for (const target of ['dev', 'local', 'staging'])
    assert.throws(() => plan(target), /Usage/)
  assert.throws(() => plan('beta', ['--force']), /Unknown/)
  assert.throws(() => plan('beta', ['--preview']), /Unknown/)
})

test('each frame is framed by its own environments only', () => {
  assert.deepEqual(frameAppOrigins('beta'), [
    'http://localhost:*',
    'http://127.0.0.1:*',
    'https://beta.app.witnesswork.app',
  ])
  assert.deepEqual(frameAppOrigins('production'), [
    'https://app.witnesswork.app',
  ])
})

test('the wrangler config serves files only, on the frame hosts', () => {
  for (const [env, name, host] of [
    ['beta', 'ww-verify-beta', 'verify-beta.witnesswork.app'],
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
    assert.ok(!script.includes('beta.app.witnesswork.app'))
    assert.ok(!script.includes('"http://localhost:*"'))
    assert.ok(script.includes('/turnstile/v0/api.js?render=explicit'))

    assert.ok(!script.includes('mapkit'))
    const headers = fs.readFileSync(path.join(out, '_headers'), 'utf8')
    assert.match(headers, /frame-ancestors https:\/\/app\.witnesswork\.app;/)
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
