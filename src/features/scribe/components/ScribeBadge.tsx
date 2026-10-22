import { Sparkles as SparklesIcon } from 'lucide-react-native'
import { type StyleProp, View, type ViewStyle } from 'react-native'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'

/** Sparkles + "Scribe AI" in a tinted pill: the AI marker, always labelled. */
export const ScribePill = ({
  compact = false,
  style,
}: {
  compact?: boolean
  style?: StyleProp<ViewStyle>
}) => {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: compact ? 3 : 5,
          borderRadius: 999,
          backgroundColor: theme.colors.accentTranslucent,
        },
        style,
      ]}
    >
      <LucideIcon icon={SparklesIcon} size={12} color={theme.colors.accent} />
      <Text
        numberOfLines={1}
        style={{
          fontSize: theme.fontSize('xs') + 1,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
          letterSpacing: tracking(0.2),
        }}
      >
        {i18n.t('scribe_name')}
      </Text>
    </View>
  )
}

/**
 * Sparkle + "Scribe AI" without a pill, under the Home orb. `wrap` lets the
 * name wrap where it has a row of its own (accessibility text sizes).
 */
export const ScribeLabel = ({
  muted = false,
  wrap = false,
}: {
  muted?: boolean
  wrap?: boolean
}) => {
  const theme = useTheme()
  const color = muted ? theme.colors.textAlt : theme.colors.accent
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        flexShrink: wrap ? 1 : undefined,
      }}
    >
      <LucideIcon icon={SparklesIcon} size={11} color={color} fill={color} />
      <Text
        numberOfLines={wrap ? undefined : 1}
        style={{
          flexShrink: wrap ? 1 : undefined,
          fontSize: theme.fontSize('sm'),
          fontFamily: theme.fonts.semiBold,
          color: muted ? theme.colors.textAlt : theme.colors.text,
        }}
      >
        {i18n.t('scribe_name')}
      </Text>
    </View>
  )
}
