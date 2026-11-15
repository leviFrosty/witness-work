import { SquareArrowOutUpRight as OpenIcon } from 'lucide-react-native'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { portionLabel } from '@/lib/routine/labels'
import type { Portion } from '@/lib/routine/readingPlans'
import { openReading } from '@/features/routine/lib/openReading'

export default function ReadingLinkButton({
  portion,
  testID,
}: {
  portion: Portion
  testID?: string
}) {
  const theme = useTheme()
  return (
    <PointerTooltip label={i18n.t('routine.screen.openInJwLibrary')}>
      <IconButton
        icon={OpenIcon}
        size={20}
        color={theme.colors.textAlt}
        style={{
          width: MIN_TOUCH_TARGET,
          height: MIN_TOUCH_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        accessibilityLabel={i18n.t('routine.home.openInJwLibrary', {
          reading: portionLabel(portion),
        })}
        onPress={() => openReading(portion, 'home')}
        testID={testID}
      />
    </PointerTooltip>
  )
}
