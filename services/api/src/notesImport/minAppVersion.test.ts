import { describe, expect, it } from 'vitest'
import { parseMinAppVersion } from './config'

describe('parseMinAppVersion — KV notes-import:min-version', () => {
  it('accepts the record form', () => {
    expect(parseMinAppVersion('{"minVersion":"1.42.0"}')).toBe('1.42.0')
  })

  it('accepts a bare JSON string', () => {
    expect(parseMinAppVersion('"1.42.0"')).toBe('1.42.0')
  })

  it('accepts an unquoted raw version that is not JSON', () => {
    expect(parseMinAppVersion('1.42.0')).toBe('1.42.0')
  })

  it('trims surrounding whitespace in every form', () => {
    expect(parseMinAppVersion('  1.42.0\n')).toBe('1.42.0')
    expect(parseMinAppVersion(' " 1.42.0 " ')).toBe('1.42.0')
    expect(parseMinAppVersion('{"minVersion":" 1.42.0 "}')).toBe('1.42.0')
  })

  it('ignores extra record keys', () => {
    expect(parseMinAppVersion('{"minVersion":"2.0.1","note":"x"}')).toBe(
      '2.0.1'
    )
  })

  it('rejects non-semver strings', () => {
    for (const raw of ['v1.42', '"1.42"', '1.42.0-beta', 'latest', '1.2.3.4']) {
      expect(parseMinAppVersion(raw), raw).toBeNull()
    }
  })

  it('rejects invalid shapes', () => {
    for (const raw of [
      '',
      '   ',
      'null',
      'true',
      '42',
      '[]',
      '["1.42.0"]',
      '{}',
      '{"minVersion":42}',
      '{"minVersion":null}',
      '{"version":"1.42.0"}',
    ]) {
      expect(parseMinAppVersion(raw), raw).toBeNull()
    }
  })
})
