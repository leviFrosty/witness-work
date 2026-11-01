import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint, Linter } from 'eslint'
import tseslint from 'typescript-eslint'
import {
  noComments,
  parseSource,
  stripSourceComments,
} from '../lib/source-comments.mjs'

const project = fileURLToPath(new URL('../../', import.meta.url))
const cleanup = []
afterEach(() => {
  for (const directory of cleanup.splice(0))
    rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const cache = path.join(project, '.cache')
  mkdirSync(cache, { recursive: true })
  const directory = mkdtempSync(path.join(cache, 'comments-test-'))
  cleanup.push(directory)
  execFileSync('git', ['init', '--quiet', directory])
  return directory
}

function run(directory, ...args) {
  return spawnSync(
    process.execPath,
    [path.join(project, 'scripts/strip-comments.mjs'), ...args],
    {
      cwd: directory,
      encoding: 'utf8',
    }
  )
}

test('strips line, block, documentation and JSX comments without changing syntax', () => {
  const source = [
    '/** docs */',
    'const count: number = 1 /* inline */ + 2 // trailing',
    'const node = <Text>one{/* JSX */}two</Text>',
    'export { count, node }',
  ].join('\n')
  const result = stripSourceComments(source, 'fixture.tsx')
  assert.equal(result.count, 4)
  assert.equal(result.source.length, source.length)
  assert.equal(parseSource(result.source, 'fixture.tsx').comments.length, 0)
  assert.equal(
    stripSourceComments(result.source, 'fixture.tsx').source,
    result.source
  )
})

test('preserves strings, regular expressions, templates and executable hashbangs', () => {
  const source = [
    '#!/usr/bin/env node',
    'const url = "https://example.test/a//b"',
    'const literal = "/* text */"',
    'const pattern = /https?:\\/\\//',
    'const template = `// text ${1 /* remove */ + 2} /* text */`',
  ].join('\n')
  const result = stripSourceComments(source, 'fixture.mjs')
  assert.equal(result.count, 1)
  assert.ok(result.source.startsWith('#!/usr/bin/env node\n'))
  assert.ok(result.source.includes('"/* text */"'))
  assert.ok(result.source.includes('`// text ${1'))
  assert.ok(result.source.includes('} /* text */`'))
})

test('preserves token separation, ASI and every JavaScript line terminator', () => {
  const source =
    'function value() { return /*\r\n\u2028\u2029*/ 1 }\nconst answer = typeof/**/value'
  const result = stripSourceComments(source, 'fixture.js')
  assert.equal(result.count, 2)
  assert.equal(
    result.source.match(/[\r\n\u2028\u2029]/g).join(''),
    source.match(/[\r\n\u2028\u2029]/g).join('')
  )
  assert.equal(Function(`${result.source}; return value()`)(), undefined)
})

test('supports every JS/TS module extension and rejects invalid input', () => {
  for (const extension of [
    'js',
    'jsx',
    'ts',
    'tsx',
    'mjs',
    'cjs',
    'mts',
    'cts',
  ])
    assert.equal(
      stripSourceComments(
        '/* comment */ const value = 1',
        `fixture.${extension}`
      ).count,
      1
    )
  assert.equal(
    stripSourceComments(
      'const identity = <Value>(value: Value) => value',
      'fixture.ts'
    ).count,
    0
  )
  assert.throws(() => stripSourceComments('const =', 'fixture.ts'))
})

test('ESLint rejects every comment including inline suppression attempts', () => {
  const linter = new Linter()
  const config = {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { noInlineConfig: true },
    plugins: { source: { rules: { 'no-comments': noComments } } },
    rules: { 'source/no-comments': 'error' },
  }
  for (const source of [
    '// comment\nconst value = 1',
    '/** docs */ const value = 1',
    'const node = <Text>{/* comment */}</Text>',
    '/* eslint-disable source/no-comments */\nconst value = 1',
    '// @ts-expect-error\nconst value = 1',
  ]) {
    const messages = linter.verify(source, config, { filename: 'fixture.tsx' })
    assert.ok(
      messages.some(
        (message) =>
          message.ruleId === 'source/no-comments' && message.severity === 2
      )
    )
  }
  assert.deepEqual(
    linter.verify('#!/usr/bin/env node\nconst value = "// text"', config, {
      filename: 'fixture.mjs',
    }),
    []
  )
})

test('the repository ESLint config rejects comments in every supported extension', async () => {
  const eslint = new ESLint({ cwd: project })
  for (const extension of [
    'js',
    'jsx',
    'ts',
    'tsx',
    'mjs',
    'cjs',
    'mts',
    'cts',
  ]) {
    const [result] = await eslint.lintText(
      '/* eslint-disable */\nexport const value = 1',
      {
        filePath: `src/lib/comment-fixture.${extension}`,
      }
    )
    assert.ok(
      result.messages.some(
        (message) =>
          message.ruleId === 'source/no-comments' && message.severity === 2
      ),
      extension
    )
  }
})

test('CLI previews, checks, formats and strips tracked and untracked source only', () => {
  const directory = fixture()
  const tracked = '// tracked\nexport const value = 1\n'
  writeFileSync(path.join(directory, 'tracked.ts'), tracked)
  writeFileSync(path.join(directory, 'deleted.ts'), tracked)
  writeFileSync(path.join(directory, '.gitignore'), 'node_modules/\n')
  execFileSync('git', ['add', '.'], { cwd: directory })
  rmSync(path.join(directory, 'deleted.ts'))
  writeFileSync(
    path.join(directory, 'untracked.tsx'),
    'export const node = <Text>{/* JSX */}one</Text>\n'
  )
  writeFileSync(path.join(directory, 'license.md'), '<!-- untouched -->\n')
  mkdirSync(path.join(directory, 'node_modules'))
  writeFileSync(
    path.join(directory, 'node_modules/dependency.js'),
    '// untouched\n'
  )
  symlinkSync('tracked.ts', path.join(directory, 'linked.ts'))
  const preview = run(directory)
  assert.equal(preview.status, 0, preview.stderr)
  assert.match(preview.stdout, /Found 2 comments in 2 files/)
  assert.equal(
    readFileSync(path.join(directory, 'tracked.ts'), 'utf8'),
    tracked
  )
  assert.equal(run(directory, '--check').status, 1)
  const write = run(directory, '--write')
  assert.equal(write.status, 0, write.stderr)
  assert.match(write.stdout, /Removed 2 comments in 2 files/)
  assert.ok(
    !readFileSync(path.join(directory, 'tracked.ts'), 'utf8').includes('//')
  )
  assert.ok(
    !readFileSync(path.join(directory, 'untracked.tsx'), 'utf8').includes('/*')
  )
  assert.equal(
    readFileSync(path.join(directory, 'license.md'), 'utf8'),
    '<!-- untouched -->\n'
  )
  assert.equal(
    readFileSync(path.join(directory, 'node_modules/dependency.js'), 'utf8'),
    '// untouched\n'
  )
  assert.equal(run(directory, '--check').status, 0)
  const contents = readFileSync(path.join(directory, 'tracked.ts'), 'utf8')
  assert.equal(run(directory, '--write').status, 0)
  assert.equal(
    readFileSync(path.join(directory, 'tracked.ts'), 'utf8'),
    contents
  )
})

test('CLI fails before writing if any source is invalid and rejects unknown options', () => {
  const directory = fixture()
  const original = '// comment\nexport const value = 1\n'
  writeFileSync(path.join(directory, 'first.ts'), original)
  writeFileSync(path.join(directory, 'last.ts'), 'const =')
  assert.notEqual(run(directory, '--write').status, 0)
  assert.equal(readFileSync(path.join(directory, 'first.ts'), 'utf8'), original)
  assert.notEqual(run(directory, '--unknown').status, 0)
  assert.notEqual(run(directory, '--check', '--write').status, 0)
})
