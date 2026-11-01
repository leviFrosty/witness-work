export type RecordRefKind = 'c' | 'p' | 'r' | 'k' | 'v' | 't' | 'b'
export type PendingRefKind = 'n' | 'nk'
export type RefKind = RecordRefKind | PendingRefKind

export type RefTarget =
  | { kind: Exclude<RecordRefKind, 'r'>; id: string }
  | { kind: 'r'; id: string; date: string }
  | {
      kind: PendingRefKind

      proposalId: string

      boundId: string | null
    }

export interface RefTable {
  next: Record<RefKind, number>
  byRef: Record<string, RefTarget>

  byId: Record<string, string>
}

export const STANDARD_CATEGORY_REF = 'k0'

const REF_PATTERN = /^(nk|[cnprkvtb])(\d{1,6})$/

export const isRefString = (value: string): boolean => REF_PATTERN.test(value)

export function emptyRefTable(): RefTable {
  return {
    next: { c: 1, p: 1, r: 1, k: 1, v: 1, t: 1, b: 1, n: 1, nk: 1 },
    byRef: {},
    byId: {},
  }
}

const idKey = (kind: RecordRefKind, id: string, date?: string) =>
  kind === 'r' ? `r:${id}@${date}` : `${kind}:${id}`

export type ResolvedRef =
  | { kind: 'c'; id: string; ref: string; pending: null }
  | { kind: 'n'; ref: string; pending: { proposalId: string } }
  | { kind: 'k'; id: string | null; ref: string; pending: null }
  | { kind: 'nk'; ref: string; pending: { proposalId: string } }
  | { kind: 'p' | 'v' | 't' | 'b'; id: string; ref: string; pending: null }
  | { kind: 'r'; id: string; date: string; ref: string; pending: null }

export class RefRegistry {
  constructor(readonly table: RefTable) {}

  checkpoint(): RefTable {
    return structuredClone(this.table)
  }

  rollback(to: RefTable): void {
    const copy = structuredClone(to)
    this.table.next = copy.next
    this.table.byRef = copy.byRef
    this.table.byId = copy.byId
  }

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

  issuePending(kind: PendingRefKind, proposalId: string): string {
    const ref = `${kind}${this.table.next[kind]++}`
    this.table.byRef[ref] = { kind, proposalId, boundId: null }
    return ref
  }

  bind(ref: string, id: string): void {
    const target = this.table.byRef[ref]
    if (!target || (target.kind !== 'n' && target.kind !== 'nk')) return
    this.table.byRef[ref] = { ...target, boundId: id }
    this.table.byId[idKey(target.kind === 'n' ? 'c' : 'k', id)] ??= ref
  }

  unbind(ref: string): void {
    const target = this.table.byRef[ref]
    if (!target || (target.kind !== 'n' && target.kind !== 'nk')) return
    if (target.boundId) {
      const key = idKey(target.kind === 'n' ? 'c' : 'k', target.boundId)
      if (this.table.byId[key] === ref) delete this.table.byId[key]
    }
    this.table.byRef[ref] = { ...target, boundId: null }
  }

  lookup(ref: string): RefTarget | null {
    return this.table.byRef[ref] ?? null
  }

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
