import { canonicalJson } from '@/lib/canonicalJson'
import {
  SYNC_MAP_KEYS,
  SYNC_SET_KEYS,
  entryTimestampKey,
  roleHistoryEntries,
} from '@/lib/syncPreferencePolicy'
import { normalizeRoleHistory, standingRole } from '@/lib/roleHistory'
import type { Publisher } from '@/types/publisher'

/** Per-entry LWW for independent month/role values, including removal stamps. */
function mergeMap(
  key: string,
  local: Record<string, unknown>,
  remote: Record<string, unknown>,
  localTs: Record<string, number>,
  remoteTs: Record<string, number>,
  updatedAt: Record<string, number>
): Record<string, unknown> {
  const result = { ...local }
  const prefix = `${key}:`
  const entries = new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
    ...Object.keys(localTs)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length)),
    ...Object.keys(remoteTs)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length)),
  ])
  for (const entry of entries) {
    const stamp = entryTimestampKey(key, entry)
    const lt = localTs[stamp] ?? (entry in local ? (localTs[key] ?? 0) : -1)
    const rt = remoteTs[stamp] ?? (entry in remote ? (remoteTs[key] ?? 0) : -1)
    if (
      rt > lt ||
      (rt === lt && canonicalJson(remote[entry]) > canonicalJson(local[entry]))
    ) {
      if (entry in remote) result[entry] = remote[entry]
      else delete result[entry]
    }
    if (Math.max(lt, rt) >= 0) updatedAt[stamp] = Math.max(lt, rt)
  }
  return result
}

export function mergePreferences(
  localValues: Record<string, unknown>,
  localUpdatedAt: Record<string, number>,
  remoteValues: Record<string, unknown>,
  remoteUpdatedAt: Record<string, number>,
  excluded: ReadonlySet<string>
): {
  values: Record<string, unknown>
  updatedAt: Record<string, number>
  changed: boolean
} {
  const values = { ...localValues }
  const updatedAt = { ...localUpdatedAt }
  for (const key of Object.keys(remoteValues ?? {})) {
    if (
      excluded.has(key) ||
      ['__proto__', 'constructor', 'prototype', 'set'].includes(key)
    )
      continue
    if (key === 'role' || key === 'roleHistory') continue
    const lt = localUpdatedAt[key] ?? 0,
      rt = remoteUpdatedAt[key] ?? 0
    if (SYNC_MAP_KEYS.has(key)) {
      values[key] = mergeMap(
        key,
        (localValues[key] ?? {}) as Record<string, unknown>,
        (remoteValues[key] ?? {}) as Record<string, unknown>,
        localUpdatedAt,
        remoteUpdatedAt,
        updatedAt
      )
      updatedAt[key] = Math.max(lt, rt)
    } else if (SYNC_SET_KEYS.has(key)) {
      const localSet = Object.fromEntries(
        ((localValues[key] as string[]) ?? []).map((entry) => [entry, true])
      )
      const remoteSet = Object.fromEntries(
        ((remoteValues[key] as string[]) ?? []).map((entry) => [entry, true])
      )
      values[key] = Object.keys(
        mergeMap(
          key,
          localSet,
          remoteSet,
          localUpdatedAt,
          remoteUpdatedAt,
          updatedAt
        )
      ).sort()
      updatedAt[key] = Math.max(lt, rt)
    } else if (
      rt > lt ||
      (rt === lt &&
        canonicalJson(remoteValues[key]) > canonicalJson(localValues[key]))
    ) {
      const before = localValues[key] as
        | { type?: string; value?: string; revision?: string }
        | undefined
      const after = remoteValues[key] as
        | { type?: string; value?: string; revision?: string }
        | undefined
      values[key] =
        key === 'avatar' &&
        before?.type === 'image' &&
        after?.type === 'image' &&
        before.revision === after.revision &&
        before.value?.startsWith('file://')
          ? { ...after, value: before.value }
          : remoteValues[key]
      updatedAt[key] = rt
    }
  }

  const lt = Math.max(localUpdatedAt.role ?? 0, localUpdatedAt.roleHistory ?? 0)
  const rt = Math.max(
    remoteUpdatedAt.role ?? 0,
    remoteUpdatedAt.roleHistory ?? 0
  )
  const localHistory = normalizeRoleHistory(localValues.roleHistory)
  const remoteHistory = normalizeRoleHistory(remoteValues.roleHistory)
  if (localHistory && remoteHistory) {
    const entries = mergeMap(
      'roleHistory',
      roleHistoryEntries(localHistory),
      roleHistoryEntries(remoteHistory),
      localUpdatedAt,
      remoteUpdatedAt,
      updatedAt
    )
    const { initial, ...changes } = entries
    const history = normalizeRoleHistory({ initial, changes })
    values.roleHistory = history
    values.role = standingRole(history, initial as Publisher)
    updatedAt.role = updatedAt.roleHistory = Math.max(lt, rt)
  } else if (
    rt > lt ||
    (rt === lt &&
      canonicalJson([remoteValues.role, remoteHistory]) >
        canonicalJson([localValues.role, localHistory]))
  ) {
    if ('role' in remoteValues) values.role = remoteValues.role
    if ('role' in remoteValues || 'roleHistory' in remoteValues) {
      values.roleHistory = remoteHistory
      updatedAt.role = updatedAt.roleHistory = rt
    }
  }
  const changed =
    canonicalJson(values) !== canonicalJson(localValues) ||
    canonicalJson(updatedAt) !== canonicalJson(localUpdatedAt)
  return { values, updatedAt, changed }
}
