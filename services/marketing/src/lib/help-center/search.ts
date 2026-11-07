import Fuse from 'fuse.js'
import { SITE } from '../site.ts'
import type { HelpBundle, HelpEntry, HelpPlatform } from './types.ts'

export const HELP_SEARCH_URL = SITE.helpSearchOrigin

export const REMOTE_TIMEOUT_MS = 8000

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const DROPPED = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭـ]/g
const REPLACED: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ٱ: 'ا',
  ة: 'ه',
  ى: 'ي',
}
for (let d = 0; d <= 9; d++) {
  REPLACED[String.fromCharCode(0x0660 + d)] = String(d)
  REPLACED[String.fromCharCode(0x06f0 + d)] = String(d)
}

export function foldForSearch(text: string): string {
  if (!ARABIC.test(text)) return text
  return text.replace(DROPPED, '').replace(/./gu, (c) => REPLACED[c] ?? c)
}

export const appliesTo = (entry: HelpEntry, platform: HelpPlatform | 'all') =>
  platform === 'all' || entry.platforms.includes(platform)

type Indexed = HelpEntry & { foldedQuestion: string; foldedText: string }

const indexes = new WeakMap<HelpBundle, Fuse<Indexed>>()

export function searchLocal(
  bundle: HelpBundle,
  query: string,
  platform: HelpPlatform | 'all'
): HelpEntry[] {
  let fuse = indexes.get(bundle)
  if (!fuse) {
    fuse = new Fuse(
      bundle.entries.map((entry) => ({
        ...entry,
        foldedQuestion: foldForSearch(entry.question),
        foldedText: foldForSearch(entry.plainText),
      })),
      {
        keys: [
          { name: 'foldedQuestion', weight: 0.7 },
          { name: 'foldedText', weight: 0.3 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }
    )
    indexes.set(bundle, fuse)
  }
  return fuse
    .search(foldForSearch(query.trim()))
    .map((result) => result.item)
    .filter((entry) => appliesTo(entry, platform))
}

export async function searchRemote(
  bundle: HelpBundle,
  query: string,
  platform: HelpPlatform | 'all',
  signal?: AbortSignal
): Promise<HelpEntry[] | null> {
  const params = new URLSearchParams({
    q: query.trim(),
    locale: bundle.locale,
    limit: '20',
  })
  if (platform !== 'all') params.set('platform', platform)
  const timeout = AbortSignal.timeout(REMOTE_TIMEOUT_MS)
  try {
    const response = await fetch(`${HELP_SEARCH_URL}/v1/search?${params}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) return null
    const body = (await response.json()) as { results?: { slug: string }[] }
    if (!Array.isArray(body.results)) return null
    const bySlug = new Map(bundle.entries.map((entry) => [entry.slug, entry]))
    return body.results
      .map((result) => bySlug.get(result.slug))
      .filter(
        (entry): entry is HelpEntry => !!entry && appliesTo(entry, platform)
      )
  } catch {
    return null
  }
}
