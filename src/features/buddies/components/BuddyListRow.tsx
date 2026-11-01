import { ReactNode } from 'react'
import { View } from 'react-native'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'

export default function BuddyListRow({
  leading,
  title,
  subtitle,
  accessory,
  trailing,
  onPress,
  actions = [],
  last,
  muted,
}: {
  leading: ReactNode
  title: string
  subtitle?: string

  accessory?: ReactNode

  trailing?: ReactNode
  onPress?: () => void

  actions?: ContextMenuEntries
  last: boolean

  muted?: boolean
}) {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: last ? 0 : 1,
        borderColor: theme.colors.border,
      }}
    >
      <ContextMenu
        style={{ flex: 1 }}
        actions={actions}
        onPress={onPress}
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            paddingLeft: 15,
            paddingRight: trailing ? 0 : 15,
          }}
        >
          <View style={{ opacity: muted ? 0.5 : 1 }}>{leading}</View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={largeText ? undefined : 1}
              style={{
                fontFamily: theme.fonts.semiBold,
                color: muted ? theme.colors.textAlt : theme.colors.text,
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                numberOfLines={largeText ? undefined : 2}
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {accessory}
        </View>
      </ContextMenu>
      {trailing ? (
        <View style={{ paddingLeft: 12, paddingRight: 15 }}>{trailing}</View>
      ) : null}
    </View>
  )
}
