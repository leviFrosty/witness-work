import { describe, expect, it } from 'vitest'
import { sanitizeNoteDocs } from '@/app/sync/payloadNotes'

const doc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }] }],
    },
  ],
}
const rich = { v: 1, doc, textHash: 'abc' }

describe('sanitizeNoteDocs', () => {
  it('keeps readable docs and drops unreadable ones, record by record', () => {
    const payload = {
      conversationStore: {
        conversations: [
          { id: 'v1', note: 'Hi', noteDoc: rich },
          { id: 'v2', note: 'Hi', noteDoc: { v: 9 } },
          { id: 'v3', note: 'Plain' },
        ],
      },
      serviceReportStore: {
        serviceReports: { 2026: { 9: [{ id: 't1', noteDoc: 'junk' }] } },
        dayPlans: [{ id: 'p1', noteDoc: rich }],
        recurringPlans: [
          { id: 'r1', overrides: [{ date: 'x', noteDoc: { doc: 1 } }] },
        ],
      },
      mileageStore: { trips: [{ id: 'trip', noteDoc: rich }] },
    }
    sanitizeNoteDocs(payload)
    const [v1, v2, v3] = payload.conversationStore.conversations
    expect(v1.noteDoc).toEqual(rich)
    expect(v2).not.toHaveProperty('noteDoc')
    expect(v3).not.toHaveProperty('noteDoc')
    expect(
      payload.serviceReportStore.serviceReports[2026][9][0]
    ).not.toHaveProperty('noteDoc')
    expect(payload.serviceReportStore.dayPlans[0].noteDoc).toEqual(rich)
    expect(
      payload.serviceReportStore.recurringPlans[0].overrides[0]
    ).not.toHaveProperty('noteDoc')
    expect(payload.mileageStore.trips[0].noteDoc).toEqual(rich)
  })

  it('tolerates missing stores', () => {
    expect(() => sanitizeNoteDocs({})).not.toThrow()
    expect(() =>
      sanitizeNoteDocs({ mileageStore: null, serviceReportStore: {} })
    ).not.toThrow()
  })
})
