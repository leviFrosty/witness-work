import { useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import * as Font from 'expo-font'
import {
  ArefRuqaa_400Regular,
  ArefRuqaa_700Bold,
} from '@expo-google-fonts/aref-ruqaa'
import { Kalam_400Regular, Kalam_700Bold } from '@expo-google-fonts/kalam'
import links from '@/constants/links'
import { fonts } from '@/constants/theme'
import { HOSTED_HANDWRITING_FONTS } from '@/features/service-reports/lib/hostedHandwritingFonts'
import { loadFonts } from '@/lib/fonts/loadFonts'

const FALLBACK = 'Kalam_400Regular'
const FALLBACK_BOLD = 'Kalam_700Bold'

let bundledLoad: Promise<void> | undefined
const bundledLoaded = () =>
  Font.isLoaded(FALLBACK) && Font.isLoaded(FALLBACK_BOLD)
const loadBundled = () =>
  (bundledLoad ??= loadFonts({
    [FALLBACK]: Kalam_400Regular,
    [FALLBACK_BOLD]: Kalam_700Bold,
  }).catch(() => {
    bundledLoad = undefined
  }))

const BUNDLED_FONTS: Record<string, number> = {
  ArefRuqaa_400Regular,
  ArefRuqaa_700Bold,
}

const hasFace = (family: string) =>
  family in BUNDLED_FONTS || family in HOSTED_HANDWRITING_FONTS

async function loadFaces(families: string[]) {
  const bundled: Record<string, number> = {}
  const hosted: Record<string, string> = {}
  for (const family of families) {
    if (family in BUNDLED_FONTS) bundled[family] = BUNDLED_FONTS[family]
    else
      hosted[family] =
        `${links.handwritingFonts}/${HOSTED_HANDWRITING_FONTS[family]}`
  }
  await Promise.all([
    loadFonts(bundled),
    Object.keys(hosted).length > 0 ? Font.loadAsync(hosted) : undefined,
  ])
}

type FontPair = { regular: string; bold: string }

function targetFontsFor(locale: string): FontPair {
  if (Platform.OS === 'web') return { regular: FALLBACK, bold: FALLBACK_BOLD }
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

  const toLoad = useMemo(
    () =>
      [...new Set([target.regular, target.bold])].filter(
        (family) => hasFace(family) && !Font.isLoaded(family)
      ),
    [target]
  )

  const [ready, setReady] = useState(() => toLoad.length === 0)
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
    if (toLoad.length === 0) {
      setReady(true)
      return
    }
    let cancelled = false
    loadFaces(toLoad)
      .then(() => !cancelled && setReady(true))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [toLoad])

  if (ready && target.regular !== FALLBACK) return target

  return bundledReady
    ? { regular: FALLBACK, bold: FALLBACK_BOLD }
    : { regular: fonts.regular, bold: fonts.bold }
}
