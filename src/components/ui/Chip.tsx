import { PropsWithChildren } from 'react'
import { View } from 'react-native'
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
      return theme.colors.warn
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

  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.border,
      }}
    >
      {icon ? (
        <Text
          style={{
            color,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {icon}
        </Text>
      ) : null}
      <Text
        style={{
          color,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {label}
      </Text>
    </View>
  )

  if (onPress) {
    return (
      <Button onPress={onPress} noTransform>
        {content}
      </Button>
    )
  }
  return content
}

export default Chip
