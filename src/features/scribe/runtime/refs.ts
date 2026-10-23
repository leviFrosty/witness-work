/**
 * Refs (ADR 0032 §4): short aliases the device mints for records, so the model
 * never sees a raw id. One table per conversation, persisted with it; a Ref is
 * stable for the conversation and never reused.
 *
 * - `c` Contact, `p` Day Plan, `r` Recurring Plan instance (plan id + day), `k`
 *   Category (`k0` is the synthetic Standard), `v` Visit, `t` Time Entry, `b`
 *   buddy (inbox id).
 * - `n` / `nk`: a Contact / Category a Proposal would create. Once the Proposal
 *   is applied the Ref is bound to the new record's id and resolves like a `c`
 *   / `k` from then on.
 */

export type RecordRefKind = 'c' | 'p' | 'r' | 'k' | 'v' | 't' | 'b'
export type PendingRefKind = 'n' | 'nk'
export type RefKind = RecordRefKind | PendingRefKind

export type RefTarget =
  | { kind: Exclude<RecordRefKind, 'r'>; id: string }
  | { kind: 'r'; id: string; date: string }
  | {
      kind: PendingRefKind
      /** The Proposal that would create it. */
      proposalId: string
      /** The created record's id once its Proposal was applied. */
      boundId: string | null
    }

export interface RefTable {
  next: Record<RefKind, number>
  byRef: Record<string, RefTarget>
  /** `kind:id` (`r:planId@YYYY-MM-DD`) → Ref, so a record keeps its Ref. */
  byId: Record<string, string>
}

export const STANDARD_CATEGORY_REF = 'k0'

const REF_PATTERN = /^(nk|[cnprkvtb])(\d{1,6})$/

export const isRefString = (value: string): boolean => REF_PATTERN.test(value)

export function emptyRefTable(): RefTable {
  return {
    // k0 is Standard; real Categories start at k1.
    next: { c: 1, p: 1, r: 1, k: 1, v: 1, t: 1, b: 1, n: 1, nk: 1 },
    byRef: {},
    byId: {},
  }
}

const idKey = (kind: RecordRefKind, id: string, date?: string) =>
  kind === 'r' ? `r:${id}@${date}` : `${kind}:${id}`

/** What a Ref resolves to for a tool. */
export type ResolvedRef =
  | { kind: 'c'; id: string; ref: string; pending: null }
  | { kind: 'n'; ref: string; pending: { proposalId: string } }
  | { kind: 'k'; id: string | null; ref: string; pending: null }
  | { kind: 'nk'; ref: string; pending: { proposalId: string } }
  | { kind: 'p' | 'v' | 't' | 'b'; id: string; ref: string; pending: null }
  | { kind: 'r'; id: string; date: string; ref: string; pending: null }

/**
 * Issues and resolves Refs over a table it mutates in place. Tools get one
 * through `ToolContext.refs`; the turn persists the table afterwards.
 */
export class RefRegistry {
  constructor(readonly table: RefTable) {}

  /** A copy of the table, to go back to when a step is discarded. */
  checkpoint(): RefTable {
    return structuredClone(this.table)
  }

  /**
   * Back to `checkpoint`. Refs minted since are forgotten and their numbers
   * minted again: the model never saw a discarded step's results.
   */
  rollback(to: RefTable): void {
    const copy = structuredClone(to)
    this.table.next = copy.next
    this.table.byRef = copy.byRef
    this.table.byId = copy.byId
  }

  /** The record's Ref, minting one the first time it's seen. */
  issue(kind: Exclude<RecordRefKind, 'r'>, id: string): string
  issue(kind: 'r', id: string, date: string): string
  issue(kind: RecordRefKind, id: string, date?: string): string {
    const key = idKey(kind, id, date)
    const existing = this.table.byId[key]
    if (existing) return existing
    const ref = `${kind}${this.table.next[kind]++}`
    this.table.byRef[ref] =
      kind === 'r' ? { kind, id, date: date ?? '' } : { kind, id }
    this.table.byId[key] = ref
    return ref
  }

  /** Mints the Ref for a record a Proposal would create. */
  issuePending(kind: PendingRefKind, proposalId: string): string {
    const ref = `${kind}${this.table.next[kind]++}`
    this.table.byRef[ref] = { kind, proposalId, boundId: null }
    return ref
  }

  /**
   * Binds a pending Ref to the record its Proposal created, so it resolves as
   * that record from now on (and the record keeps that Ref).
   */
  bind(ref: string, id: string): void {
    const target = this.table.byRef[ref]
    if (!target || (target.kind !== 'n' && target.kind !== 'nk')) return
    this.table.byRef[ref] = { ...target, boundId: id }
    this.table.byId[idKey(target.kind === 'n' ? 'c' : 'k', id)] ??= ref
  }

  /** Undo of an apply: the record is gone, so its Ref is pending no more. */
  unbind(ref: string): void {
    const target = this.table.byRef[ref]
    if (!target || (target.kind !== 'n' && target.kind !== 'nk')) return
    if (target.boundId) {
      const key = idKey(target.kind === 'n' ? 'c' : 'k', target.boundId)
      if (this.table.byId[key] === ref) delete this.table.byId[key]
    }
    this.table.byRef[ref] = { ...target, boundId: null }
  }

  /** The target this registry issued for `ref`, or null for an unknown one. */
  lookup(ref: string): RefTarget | null {
    return this.table.byRef[ref] ?? null
  }

  /**
   * Resolves `ref`; null when this conversation never issued it. A bound
   * pending Ref resolves as the record it created.
   */
  resolve(ref: string): ResolvedRef | null {
    if (ref === STANDARD_CATEGORY_REF)
      return { kind: 'k', id: null, ref, pending: null }
    const target = this.table.byRef[ref]
    if (!target) return null
    switch (target.kind) {
      case 'n':
        return target.boundId
          ? { kind: 'c', id: target.boundId, ref, pending: null }
          : {
              kind: 'n',
              ref,
              pending: { proposalId: target.proposalId },
            }
      case 'nk':
        return target.boundId
          ? { kind: 'k', id: target.boundId, ref, pending: null }
          : {
              kind: 'nk',
              ref,
              pending: { proposalId: target.proposalId },
            }
      case 'r':
        return {
          kind: 'r',
          id: target.id,
          date: target.date,
          ref,
          pending: null,
        }
      case 'k':
        return { kind: 'k', id: target.id, ref, pending: null }
      default:
        return { kind: target.kind, id: target.id, ref, pending: null }
    }
  }
}
