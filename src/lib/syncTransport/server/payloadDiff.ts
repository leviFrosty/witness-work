import isEqual from 'lodash/isEqual'
import { contentHash } from '@/lib/contentHash'

export const PAYLOAD_CHANGE_VERSION = 1

export type PayloadChange = {
  v: number
  leaves?: Record<string, unknown>
  records?: Record<string, unknown[]>
  removedLeaves?: string[]
  removedRecords?: Record<string, string[]>
}

export type Fingerprints = Record<string, string>

export type PayloadTree = Record<string, unknown>

export type HeldElsewhere = (entry: {
  path: string
  id?: string
  value: unknown
}) => boolean

const ATOMIC: ReadonlySet<string> = new Set([
  'preferencesStore',
  'profileStore',
])

const WHOLE: ReadonlySet<string> = new Set([
  ...ATOMIC,
  'resetEpoch',
  'revenueCat',
])

const HEADER: readonly string[] = ['writtenAt', 'calibratedClock']

const FULL_BASE_LEAVES: readonly string[] = ['deviceId', 'resetEpoch']

const UNSAFE: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
])

const isTree = (value: unknown): value is PayloadTree =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const safeKey = (key: string) =>
  key.length > 0 && !key.includes('/') && !key.includes('#') && !UNSAFE.has(key)

const walkable = (tree: PayloadTree) => {
  const keys = Object.keys(tree)
  return keys.length > 0 && keys.every(safeKey)
}

const idOf = (item: unknown): string | null =>
  isTree(item) && typeof item.id === 'string' ? item.id : null

function isRecordArray(list: unknown[]): boolean {
  if (list.length === 0) return false
  const ids = new Set<string>()
  for (const item of list) {
    const id = idOf(item)
    if (id === null) return false
    ids.add(id)
  }
  return ids.size === list.length
}

const fingerprint = (value: unknown): string => {
  const json = JSON.stringify(value) ?? ''
  return `${json.length.toString(36)}.${contentHash(json)}`
}

const leafKey = (path: string) => `l:${path}`
const recordKey = (path: string, id: string) => `r:${path}#${id}`

type Visitor = {
  leaf(path: string, value: unknown): void
  record(path: string, id: string, value: unknown): void
  branch(path: string, kind: 'tree' | 'records'): void
}

function walk(node: PayloadTree, prefix: string, visit: Visitor): void {
  for (const [key, value] of Object.entries(node)) {
    if (!prefix && HEADER.includes(key)) continue
    const path = prefix ? `${prefix}/${key}` : key
    if (!prefix && WHOLE.has(key)) visit.leaf(path, value)
    else if (Array.isArray(value)) {
      if (!isRecordArray(value)) {
        visit.leaf(path, value)
        continue
      }
      visit.branch(path, 'records')
      for (const item of value) visit.record(path, idOf(item)!, item)
    } else if (isTree(value) && walkable(value)) {
      visit.branch(path, 'tree')
      walk(value, path, visit)
    } else visit.leaf(path, value)
  }
}

export function fingerprintPayload(payload: PayloadTree): Fingerprints | null {
  if (!walkable(payload)) return null
  const fingerprints: Fingerprints = {}
  walk(payload, '', {
    leaf: (path, value) => {
      fingerprints[leafKey(path)] = fingerprint(value)
    },
    record: (path, id, value) => {
      fingerprints[recordKey(path, id)] = fingerprint(value)
    },
    branch: () => {},
  })
  return fingerprints
}

export type PayloadDiff = {
  fingerprints: Fingerprints

  change: PayloadChange | null

  needsBase: boolean
}

export function diffPayload(
  payload: PayloadTree,
  known: Fingerprints,
  heldElsewhere?: HeldElsewhere
): PayloadDiff | null {
  if (!walkable(payload)) return null
  const fingerprints: Fingerprints = {}
  const change: PayloadChange = { v: PAYLOAD_CHANGE_VERSION }
  const present = new Set<string>()
  let changed = false
  let needsBase = false

  const setLeaf = (path: string, value: unknown) => {
    ;(change.leaves ??= {})[path] = value
    changed = true
  }
  walk(payload, '', {
    branch(path, kind) {
      present.add(path)

      if (leafKey(path) in known) setLeaf(path, kind === 'tree' ? {} : [])
    },
    leaf(path, value) {
      present.add(path)
      const key = leafKey(path)
      const mark = fingerprint(value)
      if (known[key] === mark) {
        fingerprints[key] = mark
        return
      }
      if (ATOMIC.has(path) && heldElsewhere?.({ path, value })) {
        if (key in known) fingerprints[key] = known[key]
        return
      }
      if (FULL_BASE_LEAVES.includes(path)) needsBase = true
      fingerprints[key] = mark
      setLeaf(path, value)
    },
    record(path, id, value) {
      const key = recordKey(path, id)
      const mark = fingerprint(value)
      if (known[key] === mark) {
        fingerprints[key] = mark
        return
      }
      if (heldElsewhere?.({ path, id, value })) {
        if (key in known) fingerprints[key] = known[key]
        return
      }
      fingerprints[key] = mark
      ;((change.records ??= {})[path] ??= []).push(value)
      changed = true
    },
  })

  for (const key of Object.keys(known)) {
    if (key in fingerprints) continue
    if (key.startsWith('l:')) {
      const path = key.slice(2)
      if (present.has(path)) continue
      if (FULL_BASE_LEAVES.includes(path)) needsBase = true
      ;(change.removedLeaves ??= []).push(path)
      changed = true
      continue
    }
    const split = key.indexOf('#')
    if (!key.startsWith('r:') || split < 0) continue
    ;((change.removedRecords ??= {})[key.slice(2, split)] ??= []).push(
      key.slice(split + 1)
    )
    changed = true
  }

  if (!changed) return { fingerprints, change: null, needsBase }
  for (const key of HEADER)
    if (key in payload) (change.leaves ??= {})[key] = payload[key]
  return { fingerprints, change, needsBase }
}

function valueAt(tree: PayloadTree, path: string): unknown {
  let node: unknown = tree
  for (const key of path.split('/')) {
    if (!isTree(node) || !safeKey(key) || !Object.hasOwn(node, key))
      return undefined
    node = node[key]
  }
  return node
}

function holderOf(
  tree: PayloadTree,
  path: string,
  create: boolean
): { tree: PayloadTree; key: string } | null {
  const keys = path.split('/')
  if (!keys.every(safeKey)) return null
  let node = tree
  for (const key of keys.slice(0, -1)) {
    const next = Object.hasOwn(node, key) ? node[key] : undefined
    if (isTree(next)) node = next
    else if (!create) return null
    else node = node[key] = {}
  }
  return { tree: node, key: keys[keys.length - 1] }
}

export function heldBy(others: readonly PayloadTree[]): HeldElsewhere {
  const byPath = new Map<string, Map<string, unknown>[]>()
  return ({ path, id, value }) => {
    if (id === undefined)
      return others.some((other) => isEqual(valueAt(other, path), value))
    let indexes = byPath.get(path)
    if (!indexes) {
      indexes = others.map((other) => {
        const index = new Map<string, unknown>()
        const list = valueAt(other, path)
        if (Array.isArray(list))
          for (const item of list) {
            const itemId = idOf(item)
            if (itemId !== null) index.set(itemId, item)
          }
        return index
      })
      byPath.set(path, indexes)
    }
    return indexes.some((index) => {
      const theirs = index.get(id)
      return theirs !== undefined && isEqual(theirs, value)
    })
  }
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

export function parsePayloadChange(
  value: unknown
): PayloadChange | 'newer' | null {
  if (!isTree(value) || typeof value.v !== 'number') return null
  if (value.v > PAYLOAD_CHANGE_VERSION) return 'newer'
  const { leaves, records, removedLeaves, removedRecords } = value
  if (
    value.v !== PAYLOAD_CHANGE_VERSION ||
    (leaves !== undefined && !isTree(leaves)) ||
    (records !== undefined &&
      !(isTree(records) && Object.values(records).every(Array.isArray))) ||
    (removedLeaves !== undefined && !isStringList(removedLeaves)) ||
    (removedRecords !== undefined &&
      !(
        isTree(removedRecords) &&
        Object.values(removedRecords).every(isStringList)
      ))
  )
    return null
  return value as PayloadChange
}

export function applyPayloadChange(
  payload: PayloadTree,
  change: PayloadChange
): void {
  for (const [path, ids] of Object.entries(change.removedRecords ?? {})) {
    const holder = holderOf(payload, path, false)
    const list = holder?.tree[holder.key]
    if (!holder || !Array.isArray(list)) continue
    const gone = new Set(ids)
    holder.tree[holder.key] = list.filter((item) => {
      const id = idOf(item)
      return id === null || !gone.has(id)
    })
  }
  for (const path of change.removedLeaves ?? []) {
    const holder = holderOf(payload, path, false)
    if (holder) delete holder.tree[holder.key]
  }
  const leaves = change.leaves ?? {}
  for (const path of Object.keys(leaves).sort((a, b) => a.length - b.length)) {
    const holder = holderOf(payload, path, true)
    if (holder) holder.tree[holder.key] = leaves[path]
  }
  for (const [path, records] of Object.entries(change.records ?? {})) {
    const holder = holderOf(payload, path, true)
    if (!holder) continue
    let list = holder.tree[holder.key]
    if (!Array.isArray(list)) holder.tree[holder.key] = list = []
    const slots = list as unknown[]
    const at = new Map<string, number>()
    slots.forEach((item, index) => {
      const id = idOf(item)
      if (id !== null) at.set(id, index)
    })
    for (const record of records) {
      const id = idOf(record)
      if (id === null) continue
      const index = at.get(id)
      if (index === undefined) {
        at.set(id, slots.length)
        slots.push(record)
      } else slots[index] = record
    }
  }
}
