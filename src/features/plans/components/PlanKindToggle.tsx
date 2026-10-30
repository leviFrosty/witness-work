import { View } from 'react-native'
import {
  Calendar1 as Calendar1Icon,
  Repeat as RepeatIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize, {
  FIT_ONE_LINE,
} from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import { toggleState } from '@/lib/toggleState'

/** One Time / Recurring, at the top of the Plan form's dock. */
const PlanKindToggle = (props: {
  oneTime: boolean
  setOneTime: (oneTime: boolean) => void
}) => {
  const theme = useTheme()
  // At accessibility text sizes each half is too narrow for its icon and
  // label: the decorative icon goes, and the label shrinks onto one line.
  const largeText = useAccessibilityTextSize()
  const option = (oneTime: boolean, icon: AppIcon, label: string) => {
    const active = props.oneTime === oneTime
    const color = active ? theme.colors.accent : theme.colors.text
    return (
      <Button
        noTransform
        onPress={() => props.setOneTime(oneTime)}
        accessibilityRole='button'
        accessibilityLabel={label}
        {...toggleState(active)}
        testID={oneTime ? 'plan-kind-one-time' : 'plan-kind-recurring'}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          minHeight: MIN_TOUCH_TARGET,
          borderRadius: 999,
          backgroundColor: active ? theme.colors.accentTranslucent : undefined,
          borderWidth: active ? 1 : 0,
          borderColor: theme.colors.accent,
        }}
      >
        {!largeText && <LucideIcon icon={icon} size={16} color={color} />}
        <Text
          {...(largeText ? FIT_ONE_LINE : undefined)}
          style={{ color, flexShrink: 1 }}
        >
          {label}
        </Text>
      </Button>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        borderRadius: 999,
        padding: 2,
      }}
    >
      {option(true, Calendar1Icon, i18n.t('oneTime'))}
      {option(false, RepeatIcon, i18n.t('recurring'))}
    </View>
  )
}

export default PlanKindToggle
