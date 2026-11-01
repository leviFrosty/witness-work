import { useState } from 'react'
import { ActivityIndicator, Pressable } from 'react-native'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import type { AppIcon } from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'

export default function CarPeopleActionRow({
  icon,
  label,
  description,
  info,
  onPress,
  loading,
  disabled,
  lastInSection,
  testID,
}: {
  icon: AppIcon
  label: string
  description?: string
  info?: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  lastInSection?: boolean
  testID?: string
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const inactive = loading || disabled
  return (
    <PointerHover onHoverChange={setHovered}>
      <Pressable
        onPress={onPress}
        disabled={inactive}
        accessibilityRole='button'
        accessibilityLabel={label}
        accessibilityHint={description}
        accessibilityState={{ disabled: !!disabled, busy: !!loading }}
        testID={testID}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        })}
      >
        <InputRowContainer
          label={label}
          leftIcon={icon}
          description={description}
          descriptionReadByControl
          info={info}
          lastInSection={lastInSection}
          controlWidth='auto'
          inlineAtLargeText
        >
          {loading ? (
            <ActivityIndicator size='small' color={theme.colors.textAlt} />
          ) : null}
        </InputRowContainer>
        <HoverTint visible={hovered && !inactive} />
      </Pressable>
    </PointerHover>
  )
}
