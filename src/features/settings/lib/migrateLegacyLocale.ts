import { usePreferences } from '@/stores/preferences'

// Run on each launch: an older iCloud peer can reintroduce the retired locale.
// Raw setState preserves the timestamp of the user's actual language choice.
export function migrateLegacyLocale() {
  const legacyLocale = (
    usePreferences.getState() as unknown as { locale?: string }
  ).locale
  if (legacyLocale !== 'es-mx') return
  usePreferences.setState({ locale: 'es-es' })
}
