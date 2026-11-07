import { appLinkFragment } from '@/constants/appLinks'
import { fromUtf8, utf8 } from '@/lib/bytes'
import type { SealedSecrets } from '@/lib/webStorage/sealedSecrets'
import type { WebLinkKind } from '@/lib/webLinks/pendingWebLink'

export const KEPT_WEB_LINK = 'pending-link'

export const KEEP_WEB_LINK_MS = 60 * 60_000

type Kept = { v: 1; kind: WebLinkKind; link: string; savedAt: number }

const isKind = (value: unknown): value is WebLinkKind =>
  value === 'contact' || value === 'buddyInvite'

type Options = {
  secrets: Pick<SealedSecrets, 'read' | 'write'>
  now?: () => number
}

export function createKeptWebLink({ secrets, now = Date.now }: Options) {
  return {
    async save(kind: WebLinkKind, link: string): Promise<void> {
      const kept: Kept = { v: 1, kind, link, savedAt: now() }
      await secrets.write(KEPT_WEB_LINK, utf8(JSON.stringify(kept)))
    },

    async read(): Promise<{ kind: WebLinkKind; link: string } | null> {
      const sealed = await secrets.read(KEPT_WEB_LINK)
      if (!sealed) return null
      let kept: Partial<Kept>
      try {
        kept = JSON.parse(fromUtf8(sealed)) as Partial<Kept>
      } catch {
        return null
      }
      const age = now() - (kept.savedAt ?? Number.NaN)
      if (
        kept.v !== 1 ||
        !isKind(kept.kind) ||
        typeof kept.link !== 'string' ||
        !appLinkFragment(kept.link, kept.kind) ||
        !(age >= 0 && age <= KEEP_WEB_LINK_MS)
      ) {
        await secrets.write(KEPT_WEB_LINK, null).catch(() => undefined)
        return null
      }
      return { kind: kept.kind, link: kept.link }
    },
    forget: () => secrets.write(KEPT_WEB_LINK, null),
  }
}

export type KeptWebLink = ReturnType<typeof createKeptWebLink>
