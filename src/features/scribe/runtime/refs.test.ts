import { describe, expect, it } from 'vitest'
import {
  emptyRefTable,
  isRefString,
  RefRegistry,
  STANDARD_CATEGORY_REF,
} from '@/features/scribe/runtime/refs'

const registry = () => new RefRegistry(emptyRefTable())

describe('RefRegistry', () => {
  it('gives a record the same Ref every time, per kind', () => {
    const refs = registry()
    expect(refs.issue('c', 'contact-a')).toBe('c1')
    expect(refs.issue('c', 'contact-b')).toBe('c2')
    expect(refs.issue('c', 'contact-a')).toBe('c1')
    expect(refs.issue('p', 'plan-a')).toBe('p1')
    expect(refs.issue('v', 'visit-a')).toBe('v1')
    expect(refs.issue('t', 'entry-a')).toBe('t1')
    expect(refs.issue('b', 'inbox-a')).toBe('b1')
  })

  it('starts real Categories at k1; k0 is Standard', () => {
    const refs = registry()
    expect(refs.issue('k', 'category-a')).toBe('k1')
    expect(refs.resolve(STANDARD_CATEGORY_REF)).toEqual({
      kind: 'k',
      id: null,
      ref: 'k0',
      pending: null,
    })
    expect(refs.resolve('k1')).toEqual({
      kind: 'k',
      id: 'category-a',
      ref: 'k1',
      pending: null,
    })
  })

  it('keys Recurring Plan instances by plan and day', () => {
    const refs = registry()
    const monday = refs.issue('r', 'recurring-a', '2026-10-26')
    const nextMonday = refs.issue('r', 'recurring-a', '2026-11-02')
    expect([monday, nextMonday]).toEqual(['r1', 'r2'])
    expect(refs.issue('r', 'recurring-a', '2026-10-26')).toBe('r1')
    expect(refs.resolve('r2')).toEqual({
      kind: 'r',
      id: 'recurring-a',
      date: '2026-11-02',
      ref: 'r2',
      pending: null,
    })
  })

  it('never reuses a Ref, even after its pending record is undone', () => {
    const refs = registry()
    const first = refs.issuePending('n', 'pr_1')
    refs.bind(first, 'contact-new')
    refs.unbind(first)
    const second = refs.issuePending('n', 'pr_2')
    expect([first, second]).toEqual(['n1', 'n2'])
    expect(refs.issuePending('nk', 'pr_2')).toBe('nk1')
  })

  it('resolves a pending Ref to its Proposal until it is bound', () => {
    const refs = registry()
    const ref = refs.issuePending('n', 'pr_1')
    expect(refs.resolve(ref)).toEqual({
      kind: 'n',
      ref,
      pending: { proposalId: 'pr_1' },
    })
    refs.bind(ref, 'contact-new')
    expect(refs.resolve(ref)).toEqual({
      kind: 'c',
      id: 'contact-new',
      ref,
      pending: null,
    })
    // The created record keeps the pending Ref instead of getting a c Ref.
    expect(refs.issue('c', 'contact-new')).toBe(ref)
  })

  it('binds a pending Category like a k Ref', () => {
    const refs = registry()
    const ref = refs.issuePending('nk', 'pr_1')
    refs.bind(ref, 'category-new')
    expect(refs.resolve(ref)).toEqual({
      kind: 'k',
      id: 'category-new',
      ref,
      pending: null,
    })
    expect(refs.issue('k', 'category-new')).toBe(ref)
  })

  it('unbinds on undo: pending again, and the id forgets the Ref', () => {
    const refs = registry()
    const ref = refs.issuePending('n', 'pr_1')
    refs.bind(ref, 'contact-new')
    refs.unbind(ref)
    expect(refs.resolve(ref)).toEqual({
      kind: 'n',
      ref,
      pending: { proposalId: 'pr_1' },
    })
    expect(refs.table.byId['c:contact-new']).toBeUndefined()
  })

  it('leaves records alone when asked to bind or unbind a non-pending Ref', () => {
    const refs = registry()
    const ref = refs.issue('c', 'contact-a')
    refs.bind(ref, 'other')
    refs.unbind(ref)
    expect(refs.resolve(ref)).toEqual({
      kind: 'c',
      id: 'contact-a',
      ref,
      pending: null,
    })
    refs.bind('n9', 'contact-x')
    expect(refs.resolve('n9')).toBeNull()
  })

  it('resolves Refs it never issued to null', () => {
    const refs = registry()
    refs.issue('c', 'contact-a')
    for (const unknown of [
      'c2',
      'c99',
      'p1',
      'n1',
      'nk1',
      'k1',
      'contact-a',
      '',
    ])
      expect(refs.resolve(unknown)).toBeNull()
    expect(refs.lookup('c99')).toBeNull()
  })

  it('works over a persisted table', () => {
    const table = emptyRefTable()
    new RefRegistry(table).issue('c', 'contact-a')
    const restored = new RefRegistry(structuredClone(table))
    expect(restored.issue('c', 'contact-b')).toBe('c2')
    expect(restored.resolve('c1')).toMatchObject({ id: 'contact-a' })
  })
})

describe('isRefString', () => {
  it('accepts every Ref kind and rejects ids', () => {
    for (const ref of ['c1', 'n12', 'nk3', 'p1', 'r40', 'k0', 'v2', 't9', 'b1'])
      expect(isRefString(ref)).toBe(true)
    for (const value of ['c', 'x1', 'contact-a', 'c1a', 'nkk1', 'c1234567'])
      expect(isRefString(value)).toBe(false)
  })
})
