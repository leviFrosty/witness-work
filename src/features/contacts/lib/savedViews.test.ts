import { describe, expect, it, vi } from 'vitest'
vi.mock('expo-crypto', () => ({ randomUUID: () => 'generated' }))
import {
  DEFAULT_CONTACTS_QUERY,
  addSavedView,
  deleteSavedView,
  editActiveSavedView,
  isDefaultContactsQuery,
  moveSavedView,
  reorderSavedViews,
  orderedSavedViews,
  renameSavedView,
  resolveContactsQuery,
  resolveCustomFieldReferences,
  savedViewAnalyticsSort,
  updateSavedViewQuery,
  type SavedContactViews,
} from '@/features/contacts/lib/savedViews'
import type { CustomFieldDefinition } from '@/types/customField'
import type { ContactsQuery } from '@/types/savedContactView'

const def = (
  id: string,
  extra: Partial<CustomFieldDefinition> = {}
): CustomFieldDefinition => ({
  id,
  label: id,
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
})

const studies: ContactsQuery = {
  filters: [{ kind: 'hasStudy' }],
  sort: 'recentConversation',
  direction: 'desc',
}
const spanish: ContactsQuery = {
  filters: [
    { kind: 'customField', defId: 'lang', op: 'equals', value: 'Spanish' },
  ],
  sort: 'customField:lang',
  direction: 'asc',
}

const views = (): SavedContactViews => ({
  b: { ...spanish, name: 'Spanish territory', order: 1, createdAt: 20 },
  a: { ...studies, name: 'Bible studies', order: 0, createdAt: 10 },
})

describe('orderedSavedViews', () => {
  it('sorts by order, then creation time, then id', () => {
    expect(
      orderedSavedViews({
        ...views(),
        c: { ...studies, name: 'Tie', order: 1, createdAt: 20 },
        d: { ...studies, name: 'Older tie', order: 1, createdAt: 5 },
      }).map((view) => view.id)
    ).toEqual(['a', 'd', 'b', 'c'])
  })
})

describe('addSavedView', () => {
  it('appends a trimmed view holding only the query', () => {
    const added = addSavedView(
      views(),
      '  Due this week  ',
      { ...studies, extra: true } as ContactsQuery,
      'new'
    )
    expect(added?.id).toBe('new')
    expect(added?.views.new).toEqual({
      ...studies,
      name: 'Due this week',
      order: 2,
      createdAt: expect.any(Number),
    })
  })

  it('starts the first view at order 0 and rejects an empty name', () => {
    expect(addSavedView({}, 'First', studies, 'x')?.views.x.order).toBe(0)
    expect(addSavedView(views(), '   ', studies)).toBeNull()
  })

  it('caps the name length', () => {
    const added = addSavedView({}, 'x'.repeat(50), studies, 'x')
    expect(added?.views.x.name).toHaveLength(30)
  })
})

describe('view edits', () => {
  it('renames, ignoring empty or unchanged names', () => {
    const current = views()
    expect(renameSavedView(current, 'a', ' Studies ').a.name).toBe('Studies')
    expect(renameSavedView(current, 'a', '  ')).toBe(current)
    expect(renameSavedView(current, 'a', 'Bible studies')).toBe(current)
    expect(renameSavedView(current, 'missing', 'Name')).toBe(current)
  })

  it('updates only the query', () => {
    const next = updateSavedViewQuery(views(), 'a', spanish)
    expect(next.a).toEqual({
      ...spanish,
      name: 'Bible studies',
      order: 0,
      createdAt: 10,
    })
  })

  it('deletes a view', () => {
    expect(Object.keys(deleteSavedView(views(), 'a'))).toEqual(['b'])
    const current = views()
    expect(deleteSavedView(current, 'missing')).toBe(current)
  })

  it('moves a view and rewrites only the entries that moved', () => {
    const current = {
      ...views(),
      c: { ...studies, name: 'Third', order: 2, createdAt: 30 },
    }
    const next = moveSavedView(current, 'b', -1)
    expect(orderedSavedViews(next).map((view) => view.id)).toEqual([
      'b',
      'a',
      'c',
    ])
    expect(next.c).toBe(current.c)
    expect(moveSavedView(current, 'a', -1)).toBe(current)
    expect(moveSavedView(current, 'c', 1)).toBe(current)
  })

  it('reorders views to a dragged order, rewriting only the ones that moved', () => {
    const current = {
      ...views(),
      c: { ...studies, name: 'Third', order: 2, createdAt: 30 },
    }
    const next = reorderSavedViews(current, ['c', 'a', 'b'])
    expect(orderedSavedViews(next).map((view) => view.id)).toEqual([
      'c',
      'a',
      'b',
    ])
    expect(reorderSavedViews(current, ['a', 'b', 'c'])).toBe(current)
  })

  it('keeps views a stale drag missed and skips ones deleted meanwhile', () => {
    const current = {
      ...views(),
      c: { ...studies, name: 'Third', order: 2, createdAt: 30 },
    }
    const next = reorderSavedViews(current, ['b', 'gone', 'a'])
    expect(orderedSavedViews(next).map((view) => view.id)).toEqual([
      'b',
      'a',
      'c',
    ])
    expect(next.c).toBe(current.c)
    expect(next).not.toHaveProperty('gone')
  })
})

describe('resolveCustomFieldReferences', () => {
  it('keeps renamed and archived fields, which keep their id', () => {
    const defs = [def('lang', { label: 'Idioma', archived: true })]
    expect(resolveCustomFieldReferences(spanish, defs)).toBe(spanish)
  })

  it('points merged legacy ids at the canonical field', () => {
    const defs = [def('canonical', { legacyIds: ['lang'] })]
    expect(resolveCustomFieldReferences(spanish, defs)).toEqual({
      filters: [
        {
          kind: 'customField',
          defId: 'canonical',
          op: 'equals',
          value: 'Spanish',
        },
      ],
      sort: 'customField:canonical',
      direction: 'asc',
    })
  })

  it('prefers a live id over another definition’s alias', () => {
    const defs = [def('other', { legacyIds: ['lang'] }), def('lang')]
    expect(resolveCustomFieldReferences(spanish, defs)).toBe(spanish)
  })

  it('drops a deleted field and falls back to the default sort', () => {
    expect(
      resolveCustomFieldReferences(
        { ...spanish, filters: [...spanish.filters, { kind: 'isFavorite' }] },
        []
      )
    ).toEqual({
      filters: [{ kind: 'isFavorite' }],
      sort: 'suggested',
      direction: 'asc',
    })
  })
})

describe('resolveContactsQuery', () => {
  const own: ContactsQuery = {
    filters: [{ kind: 'city', op: 'equals', value: 'Lyon' }],
    sort: 'az',
    direction: 'asc',
  }
  const base = {
    own,
    views: views(),
    hasAccess: true,
    customFieldDefs: [def('lang')],
  }

  it("uses the User's own filters without an active view", () => {
    expect(resolveContactsQuery({ ...base, active: null })).toEqual({
      query: own,
      view: null,
      edited: false,
    })
  })

  it('applies the active view as saved', () => {
    const resolved = resolveContactsQuery({ ...base, active: { id: 'b' } })
    expect(resolved.query).toEqual(spanish)
    expect(resolved.view?.name).toBe('Spanish territory')
    expect(resolved.edited).toBe(false)
  })

  it('applies unsaved edits and reports them', () => {
    const edits = { ...spanish, direction: 'desc' as const }
    const resolved = resolveContactsQuery({
      ...base,
      active: { id: 'b', edits },
    })
    expect(resolved.query).toEqual(edits)
    expect(resolved.edited).toBe(true)
    expect(
      resolveContactsQuery({ ...base, active: { id: 'b', edits: spanish } })
        .edited
    ).toBe(false)
  })

  it('keeps the view but stops applying it after a lapse', () => {
    const resolved = resolveContactsQuery({
      ...base,
      hasAccess: false,
      active: { id: 'b', edits: studies },
    })
    expect(resolved).toEqual({ query: own, view: null, edited: false })
  })

  it('falls back when the active view was deleted on another device', () => {
    expect(
      resolveContactsQuery({ ...base, active: { id: 'gone' } }).view
    ).toBeNull()
  })

  it('resolves custom-field references in the view it applies', () => {
    const resolved = resolveContactsQuery({
      ...base,
      customFieldDefs: [],
      active: { id: 'b' },
    })
    expect(resolved.query).toEqual({
      filters: [],
      sort: 'suggested',
      direction: 'asc',
    })
  })
})

describe('editActiveSavedView', () => {
  const saved = { ...views().b, id: 'b' }

  it('records changes, and clears them once they match the view again', () => {
    const edits = { ...spanish, filters: [] }
    expect(editActiveSavedView(saved, edits, [def('lang')])).toEqual({
      id: 'b',
      edits,
    })
    expect(editActiveSavedView(saved, spanish, [def('lang')])).toEqual({
      id: 'b',
    })
  })
})

describe('helpers', () => {
  it('recognises the default query', () => {
    expect(isDefaultContactsQuery(DEFAULT_CONTACTS_QUERY)).toBe(true)
    expect(isDefaultContactsQuery(studies)).toBe(false)
  })

  it('reports custom-field sorts without their id', () => {
    expect(savedViewAnalyticsSort(spanish)).toBe('customField')
    expect(savedViewAnalyticsSort(studies)).toBe('recentConversation')
  })
})
