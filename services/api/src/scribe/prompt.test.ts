import { describe, expect, it } from 'vitest'
import { SCRIBE_TOOLS } from '../test/scribeFixture'
import { SCRIBE_SYSTEM_PROMPT } from './prompt'

describe('SCRIBE_SYSTEM_PROMPT', () => {
  it('stays under 2,100 tokens (estimated at 3 bytes a token)', () => {
    const bytes = new TextEncoder().encode(SCRIBE_SYSTEM_PROMPT).byteLength
    expect(Math.ceil(bytes / 3)).toBeLessThanOrEqual(2_100)
  })

  it('names no tool (the app owns them)', () => {
    for (const tool of SCRIBE_TOOLS) expect(SCRIBE_SYSTEM_PROMPT).not.toContain(tool.name)
    const identifiers = SCRIBE_SYSTEM_PROMPT.match(/\b[a-z]+_[a-z_]+\b/g) ?? []
    expect(identifiers).toEqual(['untrusted_data'])
  })

  it('is static: no placeholders to interpolate', () => {
    expect(SCRIBE_SYSTEM_PROMPT).not.toMatch(/\$\{|\{\{|<%/)
  })

  it('covers the rules the plan requires', () => {
    for (const phrase of [
      'only propose',
      'Never say that anything was saved',
      'Never invent a start time',
      '"days" list',
      'latest Sent line',
      'Spoken field',
      'ask one short question',
      'choose between',
      'Prefer the app context',
      'all together in the same step',
      'propose the complete corrected set again',
      'A ref in parentheses after an added call',
      'untrusted_data',
      'language of "locale"',
      'Plain text only',
      'their ministry records',
    ])
      expect(SCRIBE_SYSTEM_PROMPT).toContain(phrase)
  })
})
