import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSecureKv } from '@/lib/webStorage/secureKv'
import { createSealedSecrets } from '@/lib/webStorage/sealedSecrets'
import {
  createKeptWebLink,
  KEEP_WEB_LINK_MS,
  KEPT_WEB_LINK,
} from '@/lib/webLinks/keptWebLink'
import {
  MAX_WEB_LINK_FRAGMENT,
  pendingWebLink,
  readWebLinkAddress,
} from '@/lib/webLinks/pendingWebLink'
import { createWebLinks } from '@/lib/webLinks/webLinks'

vi.mock('@/lib/logger', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const SECRET = 'AAECAwQFBgcICQoLDA0ODw'
const PAYLOAD = 'H4sIAAAAAAAAA6tWKkktLlGyUlBKTMpRqgUAzyNhYxIAAAA'
const APP = 'https://app.witnesswork.app'

/** The browser's storage, across "reloads" of the same browser. */
function browser() {
  const factory = new IDBFactory()
  let clock = 1_000_000
  const open = () => {
    const kv = createSecureKv({ indexedDB: factory })
    const secrets = createSealedSecrets({
      kv,
      subtle: webcrypto.subtle as SubtleCrypto,
      randomBytes: (length) =>
        webcrypto.getRandomValues(new Uint8Array(length)),
    })
    return { kv, secrets }
  }
  return {
    open,
    now: () => clock,
    advance: (ms: number) => (clock += ms),
  }
}

/** A tab of the web app: its address, history and `hashchange`. */
function tab(href: string) {
  const location = { href }
  const listeners: (() => void)[] = []
  const history = {
    state: { key: 7 },
    replaceState: vi.fn((_state: unknown, _title: string, url: string) => {
      location.href = url
    }),
  }
  return {
    page: {
      location,
      history,
      addEventListener: (_event: string, listener: () => void) =>
        listeners.push(listener),
    } as unknown as Window,
    history,
    location,
    /** The User changes the fragment in this tab's address bar. */
    navigateHash(next: string) {
      location.href = next
      for (const listener of listeners) listener()
    },
  }
}

/** One page load: the web entry's take, then `start`. */
function load(
  storage: ReturnType<typeof browser>,
  link?: { kind: 'contact' | 'buddyInvite'; link: string }
) {
  pendingWebLink.clear()
  if (link) pendingWebLink.set(link.kind, link.link)
  const { kv, secrets } = storage.open()
  const opened = vi.fn()
  const kept = createKeptWebLink({ secrets, now: storage.now })
  const links = createWebLinks({ kept, onOpened: opened })
  return { links, kv, kept, opened }
}

beforeEach(() => pendingWebLink.clear())

describe('readWebLinkAddress', () => {
  it.each([
    [`${APP}/contacts#${PAYLOAD}`, 'contact'],
    [`${APP}/contacts/#${PAYLOAD}`, 'contact'],
    [`${APP}/contacts?lang=es#${PAYLOAD}`, 'contact'],
    [`${APP}/c#${PAYLOAD}`, 'contact'],
    [`${APP}/buddies/invite#1${SECRET}`, 'buddyInvite'],
    [`${APP}/b#1${SECRET}`, 'buddyInvite'],
  ])('reads %s as a %s link', (href, kind) => {
    const read = readWebLinkAddress(href)
    expect(read?.kind).toBe(kind)
    expect(read?.withoutFragment).not.toContain('#')
  })

  it('makes the apex link with the same fragment', () => {
    expect(readWebLinkAddress(`${APP}/b#1${SECRET}`)?.link).toBe(
      `https://witnesswork.app/buddies/invite#1${SECRET}`
    )
  })

  it('knows a link route without a fragment', () => {
    expect(readWebLinkAddress(`${APP}/contacts`)).toEqual({
      kind: 'contact',
      link: null,
      withoutFragment: `${APP}/contacts`,
    })
  })

  it.each([
    `${APP}/`,
    `${APP}/home#x`,
    `${APP}/Contacts#${PAYLOAD}`,
    `${APP}/contactsx#${PAYLOAD}`,
    `${APP}/c/${PAYLOAD}`,
    `${APP}/accounts/handoff#1abc`,
    'not a url',
  ])('leaves %s alone', (href) => {
    expect(readWebLinkAddress(href)).toBeNull()
  })

  it('cuts an oversized fragment, which the parser then refuses', () => {
    const read = readWebLinkAddress(
      `${APP}/contacts#${'A'.repeat(MAX_WEB_LINK_FRAGMENT * 4)}`
    )
    expect(read!.link!.split('#')[1]).toHaveLength(MAX_WEB_LINK_FRAGMENT)
  })
})

describe('the kept link', () => {
  it('is sealed: the database never holds the link in the clear', async () => {
    const storage = browser()
    const { kept, kv } = load(storage)
    const link = `https://witnesswork.app/buddies/invite#1${SECRET}`
    await kept.save('buddyInvite', link)
    const stored = await kv.get(`sealed:${KEPT_WEB_LINK}`)
    expect(JSON.stringify(stored)).not.toContain(SECRET)
    expect(Buffer.from((stored as { data: ArrayBuffer }).data)).not.toContain(
      Buffer.from(SECRET)
    )
    expect(await kept.read()).toEqual({ kind: 'buddyInvite', link })
  })

  it('is dropped once older than an hour', async () => {
    const storage = browser()
    const { kept, kv } = load(storage)
    await kept.save('contact', `https://witnesswork.app/contacts#${PAYLOAD}`)
    storage.advance(KEEP_WEB_LINK_MS + 1)
    expect(await kept.read()).toBeNull()
    expect(await kv.get(`sealed:${KEPT_WEB_LINK}`)).toBeUndefined()
  })

  it('never reads a link of another kind or without a fragment', async () => {
    const storage = browser()
    const { kept } = load(storage)
    await kept.save('contact', `https://witnesswork.app/buddies/invite#1x`)
    expect(await kept.read()).toBeNull()
    await kept.save('contact', `https://witnesswork.app/contacts`)
    expect(await kept.read()).toBeNull()
  })
})

describe('webLinks', () => {
  const contact = {
    kind: 'contact' as const,
    link: `https://witnesswork.app/contacts#${PAYLOAD}`,
  }
  const invite = {
    kind: 'buddyInvite' as const,
    link: `https://witnesswork.app/buddies/invite#1${SECRET}`,
  }
  const ACTIVE = { activeTab: true }
  const INACTIVE = { activeTab: false }

  it('hands the address’s link to its kind’s listener until it opens it', async () => {
    const storage = browser()
    const { links, opened, kept } = load(storage, contact)
    await links.start(tab(`${APP}/`).page, ACTIVE)
    expect(await links.launchURL('buddy-invite')).toBeNull()
    expect(await links.launchURL('handoff')).toBeNull()
    expect(await links.launchURL('contact-import')).toBe(contact.link)
    // App Lock unmounted the app before the prompt showed: it comes again.
    expect(await links.launchURL('contact-import')).toBe(contact.link)
    expect(await kept.read()).toEqual(contact)
    expect(opened).not.toHaveBeenCalled()

    links.opened(contact.link)
    expect(await links.launchURL('contact-import')).toBeNull()
    expect(links.linkSinceLaunch('contact-import')).toBeNull()
    await vi.waitFor(async () => expect(await kept.read()).toBeNull())
    links.opened(contact.link)
    expect(opened).toHaveBeenCalledExactlyOnceWith('contact', { kept: false })
  })

  it('ignores an open for another link', async () => {
    const storage = browser()
    const { links } = load(storage, contact)
    await links.start(tab(`${APP}/`).page, ACTIVE)
    links.opened(invite.link)
    expect(await links.launchURL('contact-import')).toBe(contact.link)
  })

  it('brings an unopened link back after a reload, then never again', async () => {
    const storage = browser()
    // Signed out: the link waits on the sign-in screen, then the page reloads.
    const first = load(storage, invite)
    await first.links.start(tab(`${APP}/`).page, ACTIVE)
    first.kv.close()

    const second = load(storage)
    await second.links.start(tab(`${APP}/`).page, ACTIVE)
    expect(await second.links.launchURL('buddy-invite')).toBe(invite.link)
    second.links.opened(invite.link)
    expect(second.opened).toHaveBeenCalledWith('buddyInvite', { kept: true })
    await vi.waitFor(async () => expect(await second.kept.read()).toBeNull())
    second.kv.close()

    // Reloading after it opened opens nothing.
    const third = load(storage)
    await third.links.start(tab(`${APP}/`).page, ACTIVE)
    expect(await third.links.launchURL('buddy-invite')).toBeNull()
  })

  it('opens a link from the address over an older kept one', async () => {
    const storage = browser()
    const first = load(storage, invite)
    await first.links.start(tab(`${APP}/`).page, ACTIVE)
    first.kv.close()
    const second = load(storage, contact)
    await second.links.start(tab(`${APP}/`).page, ACTIVE)
    expect(await second.links.launchURL('buddy-invite')).toBeNull()
    expect(await second.links.launchURL('contact-import')).toBe(contact.link)
  })

  describe('in a tab showing "open in another tab"', () => {
    it('neither seals its link nor takes the one another tab sealed', async () => {
      const storage = browser()
      // Tab A waits on the sign-in screen with a link.
      const a = load(storage, invite)
      await a.links.start(tab(`${APP}/`).page, ACTIVE)
      // Tab B opens with no link, and with one of its own.
      const b = load(storage)
      await b.links.start(tab(`${APP}/`).page, INACTIVE)
      expect(pendingWebLink.current()).toBeNull()
      const c = load(storage, contact)
      await c.links.start(tab(`${APP}/`).page, INACTIVE)
      expect(await c.kept.read()).toEqual(invite)
    })

    it('seals its link for Use Here, which opens it after the reload', async () => {
      const storage = browser()
      const b = load(storage, contact)
      await b.links.start(tab(`${APP}/`).page, INACTIVE)
      expect(await b.kept.read()).toBeNull()
      await b.links.keepForReload()
      b.kv.close()

      const reloaded = load(storage)
      await reloaded.links.start(tab(`${APP}/`).page, ACTIVE)
      expect(await reloaded.links.launchURL('contact-import')).toBe(
        contact.link
      )
    })

    it('keeps a fragment change in memory only', async () => {
      const storage = browser()
      const { links, kept } = load(storage)
      const open = tab(`${APP}/contacts`)
      await links.start(open.page, INACTIVE)
      open.navigateHash(`${APP}/contacts#${PAYLOAD}`)
      expect(open.location.href).toBe(`${APP}/contacts`)
      expect(pendingWebLink.current()?.link).toBe(contact.link)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(await kept.read()).toBeNull()
    })
  })

  it('keeps an unopened link across a sign-in’s wipe, but not an opened one', async () => {
    const storage = browser()
    const { links, kept, kv } = load(storage, contact)
    await links.start(tab(`${APP}/`).page, ACTIVE)
    await kv.clearAll()
    await links.keepAcrossWipe()
    expect(await kept.read()).toEqual(contact)

    links.opened(contact.link)
    await kv.clearAll()
    await links.keepAcrossWipe()
    await links.keepForReload()
    expect(await kept.read()).toBeNull()
  })

  it('waits at most a second to keep a link before Use Here reloads', async () => {
    vi.useFakeTimers()
    try {
      const links = createWebLinks({
        kept: {
          save: () => new Promise<void>(() => {}),
          read: async () => null,
          forget: async () => {},
        },
      })
      pendingWebLink.set(contact.kind, contact.link)
      const done = vi.fn()
      void links.keepForReload().then(done)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(done).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  describe('in a tab already open', () => {
    it('takes a new fragment out of the address and opens it', async () => {
      const storage = browser()
      const { links, opened } = load(storage)
      const open = tab(`${APP}/buddies/invite`)
      await links.start(open.page, ACTIVE)
      const listener = vi.fn()
      links.addLinkListener(listener)

      open.navigateHash(`${APP}/buddies/invite#1${SECRET}`)
      expect(open.history.replaceState).toHaveBeenCalledWith(
        { key: 7 },
        '',
        `${APP}/buddies/invite`
      )
      expect(open.location.href).not.toContain(SECRET)
      expect(listener).toHaveBeenCalledExactlyOnceWith(invite.link)
      links.opened(invite.link)
      expect(opened).toHaveBeenCalledWith('buddyInvite', { kept: false })
      // A listener mounting later doesn't open it a second time.
      expect(await links.launchURL('buddy-invite')).toBeNull()
    })

    it('keeps it for later behind the sign-in screen or App Lock', async () => {
      const storage = browser()
      const { links, kept } = load(storage)
      const open = tab(`${APP}/contacts`)
      await links.start(open.page, ACTIVE)
      open.navigateHash(`${APP}/contacts#${PAYLOAD}`)
      expect(open.location.href).toBe(`${APP}/contacts`)
      await vi.waitFor(async () => expect(await kept.read()).toEqual(contact))
      // The listeners mount once the User is past them.
      expect(await links.launchURL('contact-import')).toBe(contact.link)
    })

    it('ignores fragments on other routes', async () => {
      const storage = browser()
      const { links } = load(storage)
      const open = tab(`${APP}/home`)
      await links.start(open.page, ACTIVE)
      const listener = vi.fn()
      links.addLinkListener(listener)
      open.navigateHash(`${APP}/home#section`)
      expect(open.history.replaceState).not.toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
