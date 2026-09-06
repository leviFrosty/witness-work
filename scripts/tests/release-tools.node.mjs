import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixtures = []
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ww-release-test-'))
  fixtures.push(dir)
  return dir
}
function write(dir, file, contents) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
  fs.writeFileSync(path.join(dir, file), contents)
}
const json = (dir, file, value) => write(dir, file, JSON.stringify(value))
const run = (cwd, command, args) =>
  spawnSync(command, args, { cwd, encoding: 'utf8' })
afterEach(() =>
  fixtures
    .splice(0)
    .forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }))
)

function check(english, translation) {
  const dir = fixture()
  json(dir, 'en-US.json', english)
  json(dir, 'ja-JP.json', translation)
  return run(root, process.execPath, [
    'scripts/check-is-missing-locale-keys.mjs',
    dir,
  ])
}

test('locale checker accepts complete nested strings and arrays, ignoring empty English', () => {
  assert.equal(
    check(
      { nested: { a: 'Hi' }, list: ['One'], blank: '' },
      { nested: { a: 'こんにちは' }, list: ['一'] }
    ).status,
    0
  )
})
test('locale checker rejects absent, empty, whitespace and nonstring translations', () => {
  for (const value of [undefined, '', '  ', null, 42, {}]) {
    const result = check(
      { nested: { a: 'Hi' } },
      { nested: { a: value }, extra: 'Unrelated' }
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /nested.a/)
  }
})
test('locale checker distinguishes literal dotted keys from nested paths', () => {
  assert.equal(check({ 'a.b': 'Hello' }, { a: { b: 'Bonjour' } }).status, 1)
})
test('locale checker fails on malformed locale JSON and missing target locales', () => {
  const dir = fixture()
  json(dir, 'en-US.json', { a: 'Hi' })
  const args = ['scripts/check-is-missing-locale-keys.mjs', dir]
  assert.equal(run(root, process.execPath, args).status, 1)
  write(dir, 'fr-FR.json', '{')
  assert.equal(run(root, process.execPath, args).status, 1)
})

function repository() {
  const dir = fixture()
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(dir, 'node_modules'),
    'dir'
  )
  write(dir, '.gitignore', 'node_modules\n')
  write(
    dir,
    'scripts/bump-version.js',
    fs.readFileSync(path.join(root, 'scripts/bump-version.js'))
  )
  json(dir, 'package.json', { version: '1.41.1' })
  write(dir, 'app.config.ts', "export default { version: '1.41.1' }\n")
  write(
    dir,
    'src/features/updates/constants/releaseNotes.ts',
    'export const releaseNotes: ReleaseNote[] = [\n]\n'
  )
  json(dir, 'src/locales/en-US.json', { updates: {} })
  for (const args of [
    ['init', '-q'],
    ['config', 'user.name', 'Test'],
    ['config', 'user.email', 'test@example.com'],
    ['add', '.'],
    ['-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'Initial'],
  ]) {
    const result = run(dir, 'git', args)
    assert.equal(result.status, 0, result.stderr)
  }
  return dir
}
const bump = (dir, ...args) =>
  run(dir, process.execPath, ['scripts/bump-version.js', ...args])
const read = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8')

test('maintenance preparation changes only versions, without commits or tags', () => {
  const dir = repository()
  const result = bump(dir, 'patch', '--skip-notes', '--prepare')
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(read(dir, 'package.json')).version, '1.41.2')
  assert.match(read(dir, 'app.config.ts'), /1\.41\.2/)
  const changed = run(dir, 'git', ['diff', '--name-only'])
    .stdout.trim()
    .split('\n')
  assert.deepEqual(changed, ['app.config.ts', 'package.json'])
  assert.equal(
    run(dir, 'git', ['rev-list', '--count', 'HEAD']).stdout.trim(),
    '1'
  )
  assert.equal(run(dir, 'git', ['tag']).stdout, '')
})
test('notes-file preparation inserts a minor announcement and preserves literal prose', () => {
  const dir = repository()
  const notesDir = fixture()
  const note = 'New: share contacts. $HOME `literal` {{name}}'
  json(notesDir, 'notes.json', { notes: [note] })
  const result = bump(
    dir,
    'minor',
    '--notes-file',
    path.join(notesDir, 'notes.json'),
    '--prepare'
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    JSON.parse(read(dir, 'src/locales/en-US.json')).updates['1420'].c1,
    note
  )
  assert.match(
    read(dir, 'src/features/updates/constants/releaseNotes.ts'),
    /version: '1.42.0'/
  )
})
test('empty notes produce no announcement; invalid notes preserve the clean tree', () => {
  for (const notes of [[], [' ']]) {
    const dir = repository()
    const notesDir = fixture()
    json(notesDir, 'notes.json', { notes })
    const result = bump(
      dir,
      'patch',
      '--notes-file',
      path.join(notesDir, 'notes.json'),
      '--prepare'
    )
    assert.equal(result.status, notes.length ? 1 : 0)
    assert.equal(run(dir, 'git', ['diff', '--', 'src']).stdout, '')
    if (notes.length)
      assert.equal(run(dir, 'git', ['status', '--porcelain']).stdout, '')
  }
})
test('dirty work and existing tags block preparation without discarding changes', () => {
  const dir = repository()
  write(dir, 'user-work.txt', 'Keep me')
  assert.equal(bump(dir, 'patch', '--skip-notes', '--prepare').status, 1)
  assert.equal(read(dir, 'user-work.txt'), 'Keep me')
  fs.unlinkSync(path.join(dir, 'user-work.txt'))
  assert.equal(run(dir, 'git', ['tag', 'v1.41.2']).status, 0)
  assert.equal(bump(dir, 'patch', '--skip-notes', '--prepare').status, 1)
  assert.equal(JSON.parse(read(dir, 'package.json')).version, '1.41.1')
})

test('implicit publication is rejected before changing any files', () => {
  const dir = repository()
  const result = bump(dir, 'patch', '--skip-notes')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Use --prepare/)
  assert.equal(run(dir, 'git', ['status', '--porcelain']).stdout, '')
  assert.equal(run(dir, 'git', ['tag']).stdout, '')
})
