import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'

type Props = {
  label: string
  value?: string
  leftIcon?: AppIcon
  onPress: () => void
  lastInSection?: boolean
}

/** A tappable settings row with an optional trailing value and chevron. */
export default function MileageLinkRow({
  label,
  value,
  leftIcon,
  onPress,
  lastInSection,
}: Props) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  // At accessibility sizes the value sits under the label with the row's
  // width, so it wraps whole instead of truncating.
  const largeText = useAccessibilityTextSize()
  return (
    <PointerHover onHoverChange={setHovered}>
      <Pressable
        onPress={onPress}
        accessibilityRole='button'
        accessibilityLabel={value ? `${label}, ${value}` : label}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      >
        <InputRowContainer
          label={label}
          leftIcon={leftIcon}
          lastInSection={lastInSection}
          controlWidth='auto'
          // A lone chevron fits beside any label; a value moves under it.
          inlineAtLargeText={!value}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {value ? (
              <Text
                style={
                  largeText
                    ? { color: theme.colors.textAlt, flexShrink: 1 }
                    : { color: theme.colors.textAlt, maxWidth: 180 }
                }
                numberOfLines={largeText ? undefined : 1}
              >
                {value}
              </Text>
            ) : null}
            <LucideIcon
              icon={ChevronForwardIcon}
              size={14}
              color={theme.colors.textAlt}
            />
          </View>
        </InputRowContainer>
        <HoverTint visible={hovered} />
      </Pressable>
    </PointerHover>
  )
}
