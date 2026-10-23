import { useEffect } from 'react'
import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { _i18n } from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { useHelpCenterStore } from '@/features/updates/stores/helpCenter'
import { helpLocaleFor } from '@/features/updates/lib/helpCenter/locale'
import { readSnapshot } from '@/features/updates/lib/helpCenter/snapshot'
import {
  categoriesFor,
  visibleEntries,
} from '@/features/updates/lib/helpCenter/visibility'

/**
 * The Help Center in the app's language: the entries and categories that apply
 * to this platform and app version. Opening it refreshes from the website in
 * the background.
 */
export default function useHelpCenter() {
  // Re-render when the language changes; `_i18n.locale` is the resolved one.
  usePreferences((s) => s.locale)
  const locale = helpLocaleFor(_i18n.locale)
  const storeLocale = useHelpCenterStore((s) => s.locale)
  const bundle = useHelpCenterStore((s) => s.bundle)
  const open = useHelpCenterStore((s) => s.open)

  useEffect(() => {
    open(locale)
  }, [open, locale])

  // Until the store catches up with a new language, show its snapshot.
  const shown = storeLocale === locale && bundle ? bundle : readSnapshot(locale)
  const entries = visibleEntries(
    shown,
    Platform.OS,
    Application.nativeApplicationVersion
  )
  return {
    locale: shown.locale,
    entries,
    categories: categoriesFor(shown, entries),
  }
}
