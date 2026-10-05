import { Pressable, View } from 'react-native'
import { Check as CheckIcon } from 'lucide-react-native'
import IsSupporter from '@/components/IsSupporter'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover from '@/components/ui/PointerHover'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { logger } from '@/lib/logger'
import { buddiesEngine } from '@/features/buddies/lib/buddiesService'
import {
  BUDDY_COLOR_NAMES,
  buddyColor,
} from '@/features/buddies/lib/buddyColors'

const SWATCH = 32

/**
 * The color a buddy's days, avatar, and dots use. Choosing one is a Supporter
 * feature; everyone else keeps the color assigned when they paired.
 */
export default function BuddyColorPicker({
  inboxId,
  colorIndex,
}: {
  inboxId: string
  colorIndex: number
}) {
  const theme = useTheme()
  const choose = (index: number) => {
    if (index === colorIndex) return
    // Saved at once; a failed roster write is retried by the next change.
    buddiesEngine
      .setColor(inboxId, index)
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
        <XView style={{ justifyContent: 'space-between' }}>
          {BUDDY_COLOR_NAMES.map((name, index) => {
            const selected = index === colorIndex % BUDDY_COLOR_NAMES.length
            return (
              <PointerHover key={name} effect='lift'>
                <Pressable
                  onPress={() => choose(index)}
                  accessibilityRole='radio'
                  accessibilityState={{ selected }}
                  accessibilityLabel={i18n.t(name)}
                  style={{
                    width: SWATCH,
                    height: SWATCH,
                    borderRadius: SWATCH / 2,
                    backgroundColor: buddyColor(theme, index),
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selected ? 3 : 0,
                    borderColor: theme.colors.text,
                  }}
                >
                  {selected && (
                    <LucideIcon
                      icon={CheckIcon}
                      size={14}
                      color={theme.colors.textInverse}
                    />
                  )}
                </Pressable>
              </PointerHover>
            )
          })}
        </XView>
      </IsSupporter>
    </View>
  )
}
