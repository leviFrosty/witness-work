import {
  ArrowDown as ArrowDownIcon,
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  ArrowUp as ArrowUpIcon,
} from 'lucide-react-native'
import Animated from 'react-native-reanimated'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

const ICONS = {
  up: ArrowUpIcon,
  down: ArrowDownIcon,
  left: ArrowLeftIcon,
  right: ArrowRightIcon,
}

/** Floats over the Schedule while today is out of view, pointing the way back. */
export default function JumpToTodayButton({
  visible,
  direction,
  bottom,
  onPress,
}: {
  visible: boolean
  /** Where today is from what's on screen. */
  direction: 'up' | 'down' | 'left' | 'right'
  bottom: number
  onPress: () => void
}) {
  const theme = useTheme()
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={{
        position: 'absolute',
        alignSelf: 'center',
        bottom,
        opacity: visible ? 1 : 0,
        transform: [{ translateY: visible ? 0 : 12 }],
        transitionProperty: ['opacity', 'transform'],
        transitionDuration: 200,
      }}
    >
      <Button
        onPress={onPress}
        accessibilityLabel={i18n.t('today')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: theme.colors.shadow,
          shadowOpacity: 0.18,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        }}
      >
        <LucideIcon
          icon={ICONS[direction]}
          size={theme.fontSize('sm')}
          color={theme.colors.accent}
        />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('today')}
        </Text>
      </Button>
    </Animated.View>
  )
}
