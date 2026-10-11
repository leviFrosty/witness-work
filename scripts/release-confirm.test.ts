import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  isConfirmed,
  releaseKeyword,
  releaseTagsInPush,
} from './release-confirm.mjs'

const sha = 'a'.repeat(40)
const zero = '0'.repeat(40)

const run = (args: string[], env: Record<string, string>, input = '') =>
  spawnSync('node', ['scripts/release-confirm.mjs', ...args], {
    input,
    env: { ...process.env, WW_RELEASE_CONFIRM: '', ...env },
    encoding: 'utf8',
  })

describe('isConfirmed', () => {
  it('accepts only the keyword for that exact version', () => {
    expect(releaseKeyword('1.45.0')).toBe('SHIP-PROD-1.45.0')
    expect(isConfirmed('1.45.0', 'SHIP-PROD-1.45.0')).toBe(true)
    expect(isConfirmed('1.45.0', ' SHIP-PROD-1.45.0\n')).toBe(true)
    expect(isConfirmed('1.45.0', 'SHIP-PROD-1.44.0')).toBe(false)
    expect(isConfirmed('1.45.0', 'ship-prod-1.45.0')).toBe(false)
    expect(isConfirmed('1.45.0', 'yes')).toBe(false)
    expect(isConfirmed('1.45.0', undefined)).toBe(false)
  })
})

describe('releaseTagsInPush', () => {
  it('finds release tags being pushed, ignoring branches and deletions', () => {
    const refs = [
      `refs/heads/main ${sha} refs/heads/main ${zero}`,
      `refs/tags/v1.45.0 ${sha} refs/tags/v1.45.0 ${zero}`,
      `(delete) ${zero} refs/tags/v1.44.0 ${sha}`,
      `refs/tags/notes ${sha} refs/tags/notes ${zero}`,
      '',
    ].join('\n')
    expect(releaseTagsInPush(refs)).toEqual(['1.45.0'])
  })
})

describe('release-confirm.mjs', () => {
  it('refuses a release tag push without the keyword', () => {
    const push = `refs/tags/v1.45.0 ${sha} refs/tags/v1.45.0 ${zero}\n`
    const refused = run(['--pre-push'], {}, push)
    expect(refused.status).toBe(1)
    expect(refused.stderr).toContain('type SHIP-PROD-1.45.0 themselves')

    const allowed = run(
      ['--pre-push'],
      { WW_RELEASE_CONFIRM: 'SHIP-PROD-1.45.0' },
      push
    )
    expect(allowed.status).toBe(0)
  })

  it('lets ordinary pushes through', () => {
    const push = `refs/heads/feat ${sha} refs/heads/feat ${zero}\n`
    expect(run(['--pre-push'], {}, push).status).toBe(0)
  })

  it('checks a version argument', () => {
    expect(run(['1.45.0'], {}).status).toBe(1)
    expect(
      run(['1.45.0'], { WW_RELEASE_CONFIRM: 'SHIP-PROD-1.45.0' }).status
    ).toBe(0)
  })
})
