import { useEffect, useMemo, useState } from 'react'
import * as Font from 'expo-font'
import { Kalam_400Regular, Kalam_700Bold } from '@expo-google-fonts/kalam'
import { fonts } from '@/constants/theme'

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
    bundledLoad = undefined
  }))

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

  ArefRuqaa_400Regular:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/arefruqaa/ArefRuqaa-Regular.ttf',
  ArefRuqaa_700Bold:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/arefruqaa/ArefRuqaa-Bold.ttf',
}

type FontPair = { regular: string; bold: string }

function targetFontsFor(locale: string): FontPair {
  const lower = locale.toLowerCase()
  if (lower.startsWith('ko'))
    return { regular: 'Gaegu_400Regular', bold: 'Gaegu_700Bold' }
  if (lower.startsWith('ja'))
    return { regular: 'KleeOne_400Regular', bold: 'KleeOne_600SemiBold' }
  if (lower.startsWith('zh'))
    return { regular: 'MaShanZheng_400Regular', bold: 'MaShanZheng_400Regular' }
  if (lower.split('-')[0] === 'ar')
    return { regular: 'ArefRuqaa_400Regular', bold: 'ArefRuqaa_700Bold' }
  return { regular: FALLBACK, bold: FALLBACK_BOLD }
}

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
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [remoteToLoad])

  if (ready && target.regular !== FALLBACK) return target

  return bundledReady
    ? { regular: FALLBACK, bold: FALLBACK_BOLD }
    : { regular: fonts.regular, bold: fonts.bold }
}
