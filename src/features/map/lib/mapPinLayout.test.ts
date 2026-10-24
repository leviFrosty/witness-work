import { describe, expect, it, vi } from 'vitest'
import type { ConversationIndex } from '@/lib/conversationIndex'
import type { ContactMarker } from '@/features/map/types/map'
import { layoutContactPins } from '@/features/map/lib/mapPinLayout'

vi.mock('@/lib/locales', () => ({
  default: {
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  },
}))
vi.mock('@/lib/dates', () => ({
  formatDisplay: () => 'Mon',
  formatMonthDayCompact: () => 'Oct 3',
  formatTime: () => '2:00 PM',
}))

const NOW = new Date('2026-10-21T10:00:00').getTime()

const index = (parts: Partial<ConversationIndex> = {}): ConversationIndex => ({
  mostRecentConvMs: new Map(),
  mostRecentConvByContact: new Map(),
  mostRecentStudyMs: new Map(),
  studyContactIds: new Set(),
  studiedThisMonthIds: new Set(),
  nextFollowUpMs: new Map(),
  missedFollowUpMs: new Map(),
  followUpsChangeAtMs: null,
  nowMs: NOW,
  stalenessFor: () => 'never',
  stalenessRankFor: () => 0,
  ...parts,
})

/** A Contact whose pin lands at map point (x, y). */
const at = (id: string, x: number, y: number): ContactMarker => ({
  id,
  name: `Contact ${id}`,
  createdAt: new Date(),
  coordinate: { latitude: y, longitude: x },
  pinColor: '#888',
})

// Coordinates are map points, so the layout reads like a drawing.
const projection = {
  project: (c: { latitude: number; longitude: number }) => ({
    x: c.longitude,
    y: c.latitude,
  }),
  size: { width: 400, height: 400 },
}

const layout = (
  contacts: ContactMarker[],
  options: Partial<Parameters<typeof layoutContactPins>[0]> = {}
) =>
  layoutContactPins({
    contacts,
    index: index(),
    nowMs: NOW,
    detail: 'nextVisit',
    projection,
    activeId: undefined,
    maxCards: 10,
    cardBounds: { left: 0, top: 0, right: 400, bottom: 400 },
    ...options,
  })

describe('layoutContactPins', () => {
  it('gathers overlapping pins under the most pressing one', () => {
    const visits = index({
      missedFollowUpMs: new Map([['b', NOW - 3 * 86400000]]),
    })
    const items = layout(
      [at('a', 100, 200), at('b', 105, 202), at('c', 300, 200)],
      {
        index: visits,
      }
    )
    // Keyed by the lead, so the pin keeps its marker as it gathers.
    expect(items.map((item) => [item.key, item.group])).toEqual([
      ['b', true],
      ['c', false],
    ])
    const [group] = items
    expect(group!.label).toBe('2')
    expect(group!.badge).toBe('overdue')
    expect(group!.members.map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('keeps every pin apart, without cards, before the map settles', () => {
    const items = layout([at('a', 100, 200), at('b', 105, 202)], {
      projection: null,
    })
    expect(items.map((item) => [item.key, item.card])).toEqual([
      ['a', null],
      ['b', null],
    ])
  })

  it("names the active Contact on its group's card", () => {
    const [group] = layout([at('a', 100, 200), at('b', 105, 202)], {
      activeId: 'b',
    })
    expect(group!.selected).toBe(true)
    expect(group!.card?.title).toBe(
      'map_group_withName {"name":"Contact b","more":1}'
    )
  })

  it('gives the selected pin the first card when space is tight', () => {
    const items = layout([at('a', 100, 200), at('b', 100, 240)], {
      activeId: 'b',
      maxCards: 1,
    })
    expect(items.find((item) => item.key === 'b')!.card).not.toBeNull()
    expect(items.find((item) => item.key === 'a')!.card).toBeNull()
  })

  it('reads a group as a count, without its card title', () => {
    const [group] = layout([at('a', 100, 200), at('b', 105, 202)])
    expect(group!.accessibilityLabel).toBe(
      'map_group_count {"count":2}, map_card_noVisits'
    )
  })

  it('describes only the pins on screen', () => {
    const items = layout([at('here', 100, 200), at('away', 900, 200)])
    const away = items.find((item) => item.key === 'away')!
    expect(away.accessibilityLabel).toBe('')
    expect(away.card).toBeNull()
    expect(items.find((item) => item.key === 'here')!.accessibilityLabel).toBe(
      'Contact here, map_card_noVisits'
    )
  })
})

describe('cards and the map overlays', () => {
  it('gives no card to a pin under an overlay', () => {
    const items = layout([at('open', 100, 100), at('covered', 300, 380)], {
      cardBounds: { left: 0, top: 0, right: 400, bottom: 340 },
    })
    expect(items.find((item) => item.key === 'open')!.card).not.toBeNull()
    expect(items.find((item) => item.key === 'covered')!.card).toBeNull()
  })
})
