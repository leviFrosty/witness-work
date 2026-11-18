import { PropsWithChildren } from 'react'
import { View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'

type ChipTone = 'neutral' | 'positive' | 'negative' | 'warn' | 'info'

interface ChipProps {
  label: string
  icon?: string
  tone?: ChipTone
  onPress?: () => void
}

const toneColor = (tone: ChipTone, theme: ReturnType<typeof useTheme>) => {
  switch (tone) {
    case 'positive':
      return theme.colors.accent
    case 'negative':
      return theme.colors.error
    case 'warn':
      return theme.colors.warnText
    case 'info':
      return theme.colors.accent3
    default:
      return theme.colors.textAlt
  }
}

const Chip: React.FC<PropsWithChildren<ChipProps>> = ({
  label,
  icon,
  tone = 'neutral',
  onPress,
}) => {
  const theme = useTheme()
  const color = toneColor(tone, theme)

  const shape: ViewStyle = {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
  }

  const content = (
    <>
      {icon ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility='no'
          style={{
            color,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {icon}
        </Text>
      ) : null}
      {}
      <Text
        style={{
          flexShrink: 1,
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </>
  )

  if (onPress) {
    return (
      <Button onPress={onPress} noTransform style={shape}>
        {content}
      </Button>
    )
  }
  return <View style={shape}>{content}</View>
}

export default Chip
