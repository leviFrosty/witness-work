import { ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

/** One row in a Buddies list section: avatar, two lines, trailing controls. */
export default function BuddyListRow({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  last,
  muted,
}: {
  leading: ReactNode
  title: string
  subtitle?: string
  trailing?: ReactNode
  onPress?: () => void
  last: boolean
  /** Fades the avatar and title for rows nobody has acted on yet. */
  muted?: boolean
}) {
  const theme = useTheme()
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.backgroundLightest : undefined,
      })}
    >
      <View style={{ opacity: muted ? 0.5 : 1 }}>{leading}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: theme.fonts.semiBold,
            color: muted ? theme.colors.textAlt : theme.colors.text,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  )
}
