import { useEffect, useMemo, useState } from 'react'
import * as Font from 'expo-font'
import { Kalam_400Regular, Kalam_700Bold } from '@expo-google-fonts/kalam'
import { fonts } from '@/constants/theme'

/**
 * Handwriting fonts for the printed-style Service Report view.
 *
 * The Latin fallback (Kalam, ~0.9MB) is bundled, and loaded the first time this
 * screen opens rather than at app launch. The CJK handwriting faces are
 * enormous — Klee One ~8.7MB, Ma Shan Zheng ~5.9MB, Gaegu ~3MB each — and only
 * a Korean/Japanese/Chinese user viewing this one screen ever needs them.
 * Bundling all three shipped ~26MB of fonts to every user. Instead we download
 * the matching face on demand from Google Fonts' free OFL mirror
 * (github.com/google/fonts) and cache it, falling back to the bundled Latin
 * face while it loads or if the download fails.
 */

const FALLBACK = 'Kalam_400Regular'
const FALLBACK_BOLD = 'Kalam_700Bold'

let bundledLoad: Promise<void> | undefined
const bundledLoaded = () =>
  Font.isLoaded(FALLBACK) && Font.isLoaded(FALLBACK_BOLD)
const loadBundled = () =>
  (bundledLoad ??= Font.loadAsync({
    [FALLBACK]: Kalam_400Regular,
    [FALLBACK_BOLD]: Kalam_700Bold,
  }).catch(() => {
    // Try again next time the screen opens.
    bundledLoad = undefined
  }))

/** Remote OFL sources, keyed by the font-family name we register them under. */
const REMOTE_FONTS: Record<string, string> = {
  Gaegu_400Regular:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/gaegu/Gaegu-Regular.ttf',
  Gaegu_700Bold:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/gaegu/Gaegu-Bold.ttf',
  KleeOne_400Regular:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/kleeone/KleeOne-Regular.ttf',
  KleeOne_600SemiBold:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/kleeone/KleeOne-SemiBold.ttf',
  MaShanZheng_400Regular:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf',
}

type FontPair = { regular: string; bold: string }

/** The handwriting face a locale wants, ignoring whether it's loaded yet. */
function targetFontsFor(locale: string): FontPair {
  const lower = locale.toLowerCase()
  if (lower.startsWith('ko'))
    return { regular: 'Gaegu_400Regular', bold: 'Gaegu_700Bold' }
  if (lower.startsWith('ja'))
    return { regular: 'KleeOne_400Regular', bold: 'KleeOne_600SemiBold' }
  if (lower.startsWith('zh'))
    return { regular: 'MaShanZheng_400Regular', bold: 'MaShanZheng_400Regular' }
  return { regular: FALLBACK, bold: FALLBACK_BOLD }
}

/**
 * Resolves the handwriting font families to render with for `locale`, lazily
 * downloading a remote CJK face if needed. Returns the bundled Latin fallback
 * until the remote face is ready (or permanently, if the download fails).
 */
export function useHandwritingFonts(locale: string): FontPair {
  const target = useMemo(() => targetFontsFor(locale), [locale])

  const remoteToLoad = useMemo(() => {
    const out: Record<string, string> = {}
    for (const family of new Set([target.regular, target.bold])) {
      if (REMOTE_FONTS[family] && !Font.isLoaded(family)) {
        out[family] = REMOTE_FONTS[family]
      }
    }
    return out
  }, [target])

  const [ready, setReady] = useState(
    () => Object.keys(remoteToLoad).length === 0
  )
  const [bundledReady, setBundledReady] = useState(bundledLoaded)

  useEffect(() => {
    if (bundledReady) return
    let cancelled = false
    void loadBundled().then(() => {
      if (!cancelled && bundledLoaded()) setBundledReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [bundledReady])

  useEffect(() => {
    if (Object.keys(remoteToLoad).length === 0) {
      setReady(true)
      return
    }
    let cancelled = false
    Font.loadAsync(remoteToLoad)
      .then(() => !cancelled && setReady(true))
      .catch(() => {
        // Keep the bundled Latin fallback — the screen stays legible.
      })
    return () => {
      cancelled = true
    }
  }, [remoteToLoad])

  if (ready && target.regular !== FALLBACK) return target
  // The app's own font for the moment Kalam takes to load, rather than a family
  // the system doesn't know yet.
  return bundledReady
    ? { regular: FALLBACK, bold: FALLBACK_BOLD }
    : { regular: fonts.regular, bold: fonts.bold }
}
