import { ReactNode } from 'react'
import { View } from 'react-native'
import ContextMenu, {
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

/**
 * One row in a Buddies list section: avatar, two lines, trailing controls.
 * Long-press opens `actions`; interactive `trailing` controls sit outside the
 * long-press target so they keep their own taps.
 */
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
  /**
   * Non-interactive trailing content inside the row's tap target, e.g. a
   * chevron.
   */
  accessory?: ReactNode
  /** Interactive trailing controls (buttons), kept out of the tap target. */
  trailing?: ReactNode
  onPress?: () => void
  /** Long-press menu for the row. */
  actions?: ContextMenuEntries
  last: boolean
  /** Fades the avatar and title for rows nobody has acted on yet. */
  muted?: boolean
}) {
  const theme = useTheme()
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
          {accessory}
        </View>
      </ContextMenu>
      {trailing ? (
        <View style={{ paddingLeft: 12, paddingRight: 15 }}>{trailing}</View>
      ) : null}
    </View>
  )
}
