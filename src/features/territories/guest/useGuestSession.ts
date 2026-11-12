import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as Crypto from 'expo-crypto'
import apis from '@/constants/apis'
import { fromB64u } from '@/lib/bytes'
import { createGuestSpacesClient } from '@/lib/sharedSpaces/client'
import {
  type GuestLink,
  parseGuestLinkFragment,
} from '@/lib/sharedSpaces/scopes'
import { guestLaunch } from '@/features/territories/guest/launch'
import {
  createGuestSession,
  type GuestSession,
  type GuestSessionState,
} from '@/features/territories/guest/session'
import {
  createGuestLinkStore,
  type GuestLinkStore,
  type GuestStorage,
} from '@/features/territories/guest/store'
import { pollDelay } from '@/features/territories/guest/timing'

const randomBytes = (length: number) =>
  globalThis.crypto.getRandomValues(new Uint8Array(length))

function browserStorage(): GuestStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function linkToOpen(store: GuestLinkStore): GuestLink | null {
  const fragment = guestLaunch.take()
  if (fragment) return parseGuestLinkFragment(fragment)
  const current = store.current()
  const saved = current ? store.load(current) : null
  if (!saved) return null
  try {
    const linkSecret = fromB64u(saved.secret)
    return linkSecret.length === 32
      ? { spaceId: saved.spaceId, linkId: saved.linkId, linkSecret }
      : null
  } catch {
    return null
  }
}

function openSession(): GuestSession | null {
  const store = createGuestLinkStore(browserStorage())
  const link = linkToOpen(store)
  if (!link) return null
  return createGuestSession({
    link,
    client: createGuestSpacesClient({ baseUrl: apis.spaces }),
    store,
    now: Date.now,
    randomBytes,
    randomUUID: () => Crypto.randomUUID(),
  })
}

const NO_LINK: GuestSessionState = {
  status: 'invalid',
  offline: false,
  queued: 0,
  lost: 0,
  refused: 0,
  keys: null,
  records: new Map(),
  guest: null,
  next: {},
  firstRecordSent: false,
}

const noSubscription = () => () => {}

const isVisible = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

export default function useGuestSession(): {
  session: GuestSession | null
  state: GuestSessionState
} {
  const [session] = useState(openSession)
  const activity = useRef(0)
  const state = useSyncExternalStore(
    session ? session.subscribe : noSubscription,
    session ? session.getState : () => NO_LINK
  )

  useEffect(() => {
    if (!session) return
    activity.current = Date.now()
    void session.start()
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      const delay = pollDelay({
        visible: isVisible(),
        idleMs: Date.now() - activity.current,
      })
      if (delay === null) return
      timer = setTimeout(() => {
        session.checkExpiry()
        void session.sync().finally(schedule)
      }, delay)
    }
    const wake = () => {
      if (!isVisible()) return clearTimeout(timer)
      session.checkExpiry()
      void session.sync().finally(schedule)
    }
    const active = () => {
      const wasIdle = pollDelay({
        visible: true,
        idleMs: Date.now() - activity.current,
      })
      activity.current = Date.now()
      if (wasIdle !== pollDelay({ visible: true, idleMs: 0 })) schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('pointerdown', active, true)
    window.addEventListener('keydown', active, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('pointerdown', active, true)
      window.removeEventListener('keydown', active, true)
    }
  }, [session])

  const expiresAt = session?.expiresAt()
  useEffect(() => {
    if (!session || expiresAt === undefined) return
    const left = expiresAt - session.corrected()
    if (left > 2 ** 31 - 1) return
    const timer = setTimeout(() => session.checkExpiry(), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [session, expiresAt])

  return { session, state }
}
