import type { RecordData } from '@/features/territories/guest/codecs'

export const GUEST_STORE_PREFIX = 'ww.territoryGuest.v1.'

export const GUEST_CURRENT_KEY = `${GUEST_STORE_PREFIX}current`

export type GuestStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>

export type SyncedRecord = {
  epoch: number
  stamp: number
  deleted: boolean
  blob: string
  seq: number
}

export type LocalWrite = {
  recordId: string
  kind: string
  data?: RecordData
  deleted: boolean
  stamp: number

  sent: boolean
}

export type StoredGuestLink = {
  v: 1
  spaceId: string
  linkId: string

  secret: string
  guestId?: string
  name?: string
  joinedAt?: number
  cursor: number
  epoch: number
  expiresAt?: number
  clockOffset: number
  records: Record<string, SyncedRecord>
  local: Record<string, LocalWrite>
  next: Record<string, number>
  streetId?: string
  firstRecordSent?: boolean
}

export const freshGuestLink = (
  spaceId: string,
  linkId: string,
  secret: string
): StoredGuestLink => ({
  v: 1,
  spaceId,
  linkId,
  secret,
  cursor: 0,
  epoch: 1,
  clockOffset: 0,
  records: {},
  local: {},
  next: {},
})

const keyFor = (linkId: string) => `${GUEST_STORE_PREFIX}${linkId}`

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parse(text: string | null): StoredGuestLink | null {
  if (!text) return null
  try {
    const value: unknown = JSON.parse(text)
    if (
      !isObject(value) ||
      value.v !== 1 ||
      typeof value.spaceId !== 'string' ||
      typeof value.linkId !== 'string' ||
      typeof value.secret !== 'string' ||
      typeof value.cursor !== 'number' ||
      !isObject(value.records) ||
      !isObject(value.local)
    )
      return null
    return {
      ...value,
      epoch: typeof value.epoch === 'number' ? value.epoch : 1,
      clockOffset:
        typeof value.clockOffset === 'number' ? value.clockOffset : 0,
      next: isObject(value.next) ? value.next : {},
    } as StoredGuestLink
  } catch {
    return null
  }
}

export function createGuestLinkStore(storage: GuestStorage | null) {
  const attempt = <T>(run: (s: GuestStorage) => T): T | null => {
    if (!storage) return null
    try {
      return run(storage)
    } catch {
      return null
    }
  }

  const remove = (linkId: string) =>
    attempt((s) => {
      s.removeItem(keyFor(linkId))
      if (s.getItem(GUEST_CURRENT_KEY) === linkId)
        s.removeItem(GUEST_CURRENT_KEY)
    })

  return {
    load: (linkId: string) =>
      attempt((s) => parse(s.getItem(keyFor(linkId)))) ?? null,

    save: (link: StoredGuestLink) =>
      attempt((s) => s.setItem(keyFor(link.linkId), JSON.stringify(link))) !==
      null,

    remove,

    current: () => attempt((s) => s.getItem(GUEST_CURRENT_KEY)) ?? null,

    setCurrent: (linkId: string) =>
      attempt((s) => s.setItem(GUEST_CURRENT_KEY, linkId)),

    sweep(now: number, keep?: string) {
      const keys =
        attempt((s) =>
          Array.from({ length: s.length }, (_, index) => s.key(index))
        ) ?? []
      for (const key of keys) {
        if (!key?.startsWith(GUEST_STORE_PREFIX) || key === GUEST_CURRENT_KEY)
          continue
        const linkId = key.slice(GUEST_STORE_PREFIX.length)
        if (linkId === keep) continue
        const link = attempt((s) => parse(s.getItem(key)))
        if (!link || (link.expiresAt !== undefined && link.expiresAt <= now))
          remove(linkId)
      }
    },
  }
}

export type GuestLinkStore = ReturnType<typeof createGuestLinkStore>
