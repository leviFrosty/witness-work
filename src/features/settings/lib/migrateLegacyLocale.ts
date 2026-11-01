import { usePreferences } from '@/stores/preferences'

export function migrateLegacyLocale() {
  const legacyLocale = (
    usePreferences.getState() as unknown as { locale?: string }
  ).locale
  if (legacyLocale !== 'es-mx') return
  usePreferences.setState({ locale: 'es-es' })
}
