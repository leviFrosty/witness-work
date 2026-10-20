import { View, ViewProps } from 'react-native'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'

export interface ChoiceChip<T extends string = string> {
  key: T
  label: string
  /** Drawn before the label, in the label's colour. */
  icon?: AppIcon
  testID?: string
}

export interface ChoiceChipsProps<T extends string = string>
  extends Omit<ViewProps, 'children'> {
  options: ReadonlyArray<ChoiceChip<T>>
  value: T | null | undefined
  onChange: (key: T) => void
}

/**
 * Single-choice bordered chips that wrap onto as many rows as they need. For
 * option sets too large or too long for a segmented control, such as filter
 * fields.
 */
export default function ChoiceChips<T extends string = string>({
  options,
  value,
  onChange,
  style,
  ...props
}: ChoiceChipsProps<T>) {
  const theme = useTheme()

  return (
    <View
      accessibilityRole='radiogroup'
      style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}
      {...props}
    >
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <Button
            key={opt.key}
            noTransform
            onPress={() => onChange(opt.key)}
            accessibilityRole='radio'
            accessibilityState={{ checked: active }}
            testID={opt.testID}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.numbers.borderRadiusSm,
              borderWidth: 1,
              borderColor: active ? theme.colors.accent : theme.colors.border,
              backgroundColor: active
                ? theme.colors.accentTranslucent
                : theme.colors.backgroundLighter,
            }}
          >
            {opt.icon && (
              <LucideIcon
                icon={opt.icon}
                size={16}
                color={active ? theme.colors.accent : theme.colors.textAlt}
              />
            )}
            <Text
              style={{
                fontSize: theme.fontSize('sm'),
                color: active ? theme.colors.accent : theme.colors.text,
                fontFamily: active ? theme.fonts.semiBold : theme.fonts.regular,
              }}
            >
              {opt.label}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}
