import { PropsWithChildren } from 'react'
import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import useTheme from '@/contexts/theme'
import Button from '@/components/Button'
import Text from '@/components/MyText'

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
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      <BlurView
        tint={theme.colors.background === '#121212' ? 'dark' : 'light'}
        intensity={50}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents='none'
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: theme.colors.card,
            opacity: 0.55,
          },
        ]}
      />
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
