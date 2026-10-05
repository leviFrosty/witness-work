import { describe, expect, it } from 'vitest'
import {
  appendCapturedText,
  inputMethodFor,
  toBcp47,
  voiceDurationBucket,
} from '@/features/notes-import/lib/notesImportCapture'

describe('appendCapturedText', () => {
  it('fills an empty draft with the trimmed capture', () => {
    expect(appendCapturedText('  ', '  Talked with Maria \n')).toBe(
      'Talked with Maria'
    )
  })

  it('adds a capture after existing text with a blank line', () => {
    expect(appendCapturedText('Page one\n', 'Page two')).toBe(
      'Page one\n\nPage two'
    )
  })

  it('leaves the draft alone when nothing was captured', () => {
    expect(appendCapturedText('Typed notes ', '   ')).toBe('Typed notes ')
  })
})

describe('inputMethodFor', () => {
  it('is text without captures, the capture method for one kind, and mixed for both', () => {
    expect(inputMethodFor([])).toBe('text')
    expect(inputMethodFor(['voice', 'voice'])).toBe('voice')
    expect(inputMethodFor(['photo'])).toBe('photo')
    expect(inputMethodFor(['photo', 'voice'])).toBe('mixed')
  })
})

describe('toBcp47', () => {
  it('normalizes app locales for the native recognizers', () => {
    expect(toBcp47('en-us')).toBe('en-US')
    expect(toBcp47('zh-hant-tw')).toBe('zh-Hant-TW')
    expect(toBcp47('bem-zm')).toBe('bem-ZM')
    expect(toBcp47('pt_BR')).toBe('pt-BR')
  })
})

describe('voiceDurationBucket', () => {
  it('buckets recording length', () => {
    expect(voiceDurationBucket(5_000)).toBe('under_15s')
    expect(voiceDurationBucket(30_000)).toBe('15s_1m')
    expect(voiceDurationBucket(90_000)).toBe('1m_3m')
    expect(voiceDurationBucket(600_000)).toBe('over_3m')
  })
})
