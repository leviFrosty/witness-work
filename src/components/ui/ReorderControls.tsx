import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import { MIN_TOUCH_TARGET, touchTargetFrame } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface Props {
  onMoveUp?: () => void
  onMoveDown?: () => void
}

const BUTTON_SIZE = 36

export default function ReorderControls({ onMoveUp, onMoveDown }: Props) {
  const theme = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: MIN_TOUCH_TARGET - BUTTON_SIZE,
        flexShrink: 0,
      }}
    >
      {[
        { icon: ArrowUp, onPress: onMoveUp, label: i18n.t('moveUp') },
        { icon: ArrowDown, onPress: onMoveDown, label: i18n.t('moveDown') },
      ].map(({ icon, onPress, label }) => (
        <Button
          key={label}
          noTransform={!onPress}
          disabled={!onPress}
          onPress={onPress}
          accessibilityLabel={label}
          hitSlop={0}
          style={{
            ...touchTargetFrame(BUTTON_SIZE),
            borderRadius: theme.numbers.borderRadiusSm,
          }}
        >
          <View
            style={{
              width: BUTTON_SIZE,
              height: BUTTON_SIZE,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.backgroundLightest,
              opacity: onPress ? 1 : 0.4,
            }}
          >
            <LucideIcon icon={icon} size={16} color={theme.colors.textAlt} />
          </View>
        </Button>
      ))}
    </View>
  )
}
