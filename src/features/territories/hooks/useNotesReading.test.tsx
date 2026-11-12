import React, { useEffect } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import type { NoteStreet } from '@/features/territories/lib/parseDoorNotes'
import type {
  NotesAi,
  NotesAiRead,
} from '@/features/territories/lib/scribeNotes'
import useNotesReading, {
  type NotesReading,
} from '@/features/territories/hooks/useNotesReading'

const oak: NoteStreet = { id: 'oak', name: 'Oak Street', numbering: 'both' }

const run = async (ai: NotesAi, text: string) => {
  let read: ReturnType<typeof useNotesReading>['read'] | null = null
  const Probe = () => {
    const reading = useNotesReading(ai)
    useEffect(() => {
      read = reading.read
    })
    return null
  }
  await act(async () => {
    create(<Probe />)
  })
  let result: NotesReading | null = null
  await act(async () => {
    result = await read!(text, { streets: [oak] })
  })
  return result as NotesReading | null
}

const scribe = (answer: NotesAiRead) => {
  const read = vi.fn(async () => answer)
  return { ai: { mode: 'available' as const, read }, read }
}

describe('useNotesReading', () => {
  it('reads with Scribe AI when it is available, sending the streets', async () => {
    const { ai, read } = scribe({
      status: 'read',
      answer: {
        doors: [{ line: 0, street: null, door: '12', outcome: 'notHome' }],
        ranges: [],
        unread: [],
      },
    })
    const result = await run(ai, '12 no estaba')
    expect(result?.reader).toEqual({ kind: 'scribe' })
    expect(result?.parsed.entries).toMatchObject([
      { label: '12', outcome: 'notHome', streetId: 'oak' },
    ])
    expect((read.mock.calls as unknown[][])[0][0]).toEqual({
      notes: '12 no estaba',
      streets: [{ name: 'Oak Street', numbering: 'both' }],
    })
  })

  it.each([
    ['off', 'scribeOff'],
    ['notOffered', 'notOffered'],
    ['limited', 'limited'],
    ['offline', 'offline'],
    ['unavailable', 'unavailable'],
  ] as const)(
    'reads on the device without asking Scribe AI when it is %s',
    async (mode, reason) => {
      const read = vi.fn()
      const result = await run({ mode, read }, '12 NH')
      expect(read).not.toHaveBeenCalled()
      expect(result?.reader).toEqual({ kind: 'device', reason })
      expect(result?.parsed.entries).toMatchObject([{ label: '12' }])
    }
  )

  it('falls back to the device when Scribe AI fails', async () => {
    const { ai } = scribe({ status: 'failed', reason: 'failed' })
    expect((await run(ai, '12 NH'))?.reader).toEqual({
      kind: 'device',
      reason: 'failed',
    })
  })

  it('falls back to the device when Scribe AI finds nothing the device can read', async () => {
    const { ai } = scribe({
      status: 'read',
      answer: { doors: [], ranges: [], unread: [] },
    })
    const result = await run(ai, '12 NH')
    expect(result?.reader).toEqual({ kind: 'device', reason: 'failed' })
    expect(result?.parsed.entries).toHaveLength(1)
  })

  it('keeps notes too long for Scribe AI on the device', async () => {
    const { ai, read } = scribe({ status: 'cancelled' })
    const result = await run(ai, `12 NH\n${'x'.repeat(8_001)}`)
    expect(read).not.toHaveBeenCalled()
    expect(result?.reader).toEqual({ kind: 'device', reason: 'tooLong' })
  })

  it('does nothing while consent is asked for or after a cancel', async () => {
    expect(await run(scribe({ status: 'consent' }).ai, '12 NH')).toBeNull()
    expect(await run(scribe({ status: 'cancelled' }).ai, '12 NH')).toBeNull()
  })
})
