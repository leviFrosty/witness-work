import { describe, expect, it } from 'vitest'
import {
  SCRIBE_MEMORY_MAX_CHARS,
  editMemory,
  memoryLines,
  replayMemoryEdits,
} from '@/features/scribe/lib/memory'

const NOTES = 'Says "group" for the Saturday car group\nPrefers plans at 9:00'

const errorOf = (result: ReturnType<typeof editMemory>) =>
  result.ok ? null : result.error

describe('memoryLines', () => {
  it('lists non-empty lines, trimmed', () => {
    expect(memoryLines('  one \n\n two\n')).toEqual(['one', 'two'])
    expect(memoryLines('')).toEqual([])
  })
})

describe('editMemory', () => {
  it('adds a note on a new line', () => {
    expect(
      editMemory(NOTES, { old: null, new: ' Calls LDC "the build" ' })
    ).toEqual({
      ok: true,
      text: `${NOTES}\nCalls LDC "the build"`,
      change: 'added',
    })
    expect(editMemory('', { old: null, new: 'First' })).toMatchObject({
      text: 'First',
    })
  })

  it('keeps a note to one line', () => {
    expect(editMemory('', { old: null, new: 'Two\nlines' })).toMatchObject({
      text: 'Two lines',
    })
  })

  it('changes nothing when the note is already there', () => {
    expect(
      editMemory(NOTES, { old: null, new: 'Prefers plans at 9:00' })
    ).toEqual({ ok: true, text: NOTES, change: null })
    expect(
      editMemory(NOTES, {
        old: 'Prefers plans at 9:00',
        new: 'Prefers plans at 9:00',
      })
    ).toEqual({ ok: true, text: NOTES, change: null })
  })

  it('changes a whole note, or the part named', () => {
    expect(
      editMemory(NOTES, {
        old: 'Prefers plans at 9:00',
        new: 'Prefers plans at 9:30',
      })
    ).toEqual({
      ok: true,
      text: 'Says "group" for the Saturday car group\nPrefers plans at 9:30',
      change: 'changed',
    })
    expect(editMemory(NOTES, { old: '9:00', new: '10:00' })).toEqual({
      ok: true,
      text: 'Says "group" for the Saturday car group\nPrefers plans at 10:00',
      change: 'changed',
    })
  })

  it('removes a note, and the line it was on', () => {
    expect(
      editMemory(NOTES, { old: 'Prefers plans at 9:00', new: null })
    ).toEqual({
      ok: true,
      text: 'Says "group" for the Saturday car group',
      change: 'removed',
    })
    expect(editMemory(`A\n\nB\nC`, { old: 'B', new: null })).toMatchObject({
      text: 'A\n\nC',
    })
  })

  it('reports cutting part of a note as a change, not a removal', () => {
    expect(editMemory(NOTES, { old: ' at 9:00', new: null })).toEqual({
      ok: true,
      text: 'Says "group" for the Saturday car group\nPrefers plans',
      change: 'changed',
    })
  })

  it('edits a whole note even when its text is inside another one', () => {
    const notes = 'Prefers 9:00\nPrefers 9:00 on Saturdays'
    expect(editMemory(notes, { old: 'Prefers 9:00', new: null })).toEqual({
      ok: true,
      text: 'Prefers 9:00 on Saturdays',
      change: 'removed',
    })
    expect(
      editMemory(notes, { old: 'Prefers 9:00', new: 'Prefers 10:00' })
    ).toMatchObject({ text: 'Prefers 10:00\nPrefers 9:00 on Saturdays' })
  })

  it('keeps $ in a note literal', () => {
    const result = editMemory("Charges $' a month", {
      old: 'a month',
      new: "$& and $' each",
    })
    expect(result).toMatchObject({ text: "Charges $' $& and $' each" })
  })

  it('says how to fix a call it can not apply, in one sentence', () => {
    const error = (old: string | null, note: string | null) =>
      errorOf(editMemory(NOTES, { old, new: note }))
    const errors = [
      error(null, null),
      error(null, '   '),
      error('Not a note', 'x'),
      error('group', 'x'),
      error(null, 'x'.repeat(151)),
    ]
    expect(errors[0]).toMatch(/Send the note/)
    expect(errors[1]).toMatch(/Send the note/)
    expect(errors[2]).toMatch(/No note in memory/)
    expect(errors[3]).toMatch(/more than one note/)
    expect(errors[4]).toMatch(/under 150/)
    for (const text of errors)
      expect(text!.split(/[.!?](?=\s|$)/).filter((s) => s.trim())).toHaveLength(
        1
      )
  })

  it('stays within its size, and says how big the edit would make it', () => {
    const full = Array.from({ length: 11 }, (_, i) =>
      `${i}`.padEnd(135, '.')
    ).join('\n')
    expect(full.length).toBeLessThanOrEqual(SCRIBE_MEMORY_MAX_CHARS)
    const error = errorOf(editMemory(full, { old: null, new: 'y'.repeat(120) }))
    expect(error).toBe(
      `That would make memory ${full.length + 121} of 1500 characters, so shorten or remove an outdated note first, in the same step.`
    )

    const room = editMemory(full, { old: `0`.padEnd(135, '.'), new: null })
    expect(room.ok && editMemory(room.text, { old: null, new: 'y' }).ok).toBe(
      true
    )
  })
})

describe('replayMemoryEdits', () => {
  it('applies whole-note edits to the memory as it is now, and says which applied', () => {
    expect(
      replayMemoryEdits('Edited in Settings\nPrefers plans at 9:00', [
        { old: null, new: 'Calls LDC "the build"' },
        { old: 'Prefers plans at 9:00', new: null },
        { old: 'Gone since', new: null },
      ])
    ).toEqual({
      text: 'Edited in Settings\nCalls LDC "the build"',
      changes: ['added', 'removed'],
    })
  })

  it('skips a part of a note, which could now be in another one', () => {
    expect(
      replayMemoryEdits('Prefers plans at 9:00 on Saturdays', [
        { old: '9:00', new: '10:00' },
      ])
    ).toEqual({ text: 'Prefers plans at 9:00 on Saturdays', changes: [] })
  })
})
