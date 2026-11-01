import { type ReactElement, useState } from 'react'
import { Pressable, View } from 'react-native'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function ProgressCardPressable({
  children,
  onEdit,
  onPress,
  accessibilityLabel,
  fill = true,
}: {
  children: ReactElement
  onEdit: () => void
  onPress?: () => void
  accessibilityLabel?: string

  fill?: boolean
}) {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  return (
    <PointerHover onHoverChange={onPress ? setHovered : undefined}>
      <Pressable
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        accessibilityActions={[
          { name: 'longpress', label: i18n.t('progressCards.editCards') },
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'longpress') onEdit()
        }}
        style={({ pressed }) => [
          fill && { flex: 1 },
          pressed && onPress ? { opacity: 0.8 } : null,
        ]}
      >
        <View style={fill ? { flex: 1 } : undefined}>
          {children}
          <HoverTint
            visible={hovered}
            borderRadius={theme.numbers.borderRadiusLg}
          />
        </View>
      </Pressable>
    </PointerHover>
  )
}
