import { View } from 'react-native'
import ColorSwatchPicker from '@/components/ColorSwatchPicker'
import IsSupporter from '@/components/IsSupporter'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import { buddySlotColor } from '@/features/buddies/lib/buddyColors'
import type { Buddy } from '@/features/buddies/lib/state'

/**
 * The color a buddy's days, avatar, and dots use. Choosing one is a Supporter
 * feature; everyone else keeps the color assigned when they paired.
 */
export default function BuddyColorPicker({ buddy }: { buddy: Buddy }) {
  const theme = useTheme()
  const choose = (color: string | null) => {
    if (color === (buddy.color ?? null)) return
    // Saved at once; a failed roster write is retried by the next change.
    buddiesEngine
      .setColor(buddy.inboxId, color)
      .catch((error) => logger.warn('[buddies] color', error))
    analytics.capture('buddy_customized', { setting: 'color' })
  }

  return (
    <View style={{ paddingVertical: 12, paddingHorizontal: 15 }}>
      <IsSupporter
        feature='buddyColor'
        analyticsSurface='buddy_color'
        title={i18n.t('buddies_color')}
      >
        <ColorSwatchPicker
          value={buddy.color ?? null}
          defaultColor={buddySlotColor(theme, buddy.colorIndex)}
          onChange={choose}
          title={i18n.t('buddies_color')}
          size={32}
        />
      </IsSupporter>
    </View>
  )
}
