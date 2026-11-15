import { analytics } from '@/lib/analytics'
import { openURL } from '@/lib/links'
import { _i18n } from '@/lib/locales'
import { readingLink } from '@/lib/routine/jwLibrary'
import type { Portion } from '@/lib/routine/readingPlans'

export function openReading(
  portion: Pick<Portion, 'chapters' | 'verses'>,
  from: 'home' | 'plan'
): void {
  const url = readingLink(portion, _i18n.locale)
  if (!url) return
  analytics.capture('routine_reading_opened', {
    from,
    unit: portion.verses ? 'verses' : 'chapters',
  })
  void openURL(url)
}
