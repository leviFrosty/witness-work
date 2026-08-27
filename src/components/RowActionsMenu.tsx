import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { Pressable, View } from 'react-native'

import useTheme from '@/contexts/theme'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'

export interface RowAction {
  /** Stable key for the row. */
  id: string
  label: string
  icon: AppIcon
  /** Renders the row in the error color — pair with `confirmDestructive`. */
  destructive?: boolean
  /**
   * Runs after the popover closes. Alerts/sheets opened here land on a screen
   * with no popover Modal in front of them.
   */
  onPress: () => void
}

interface RowActionsMenuProps {
  actions: RowAction[]
  /** Announced on the trigger, e.g. `i18n.t('moreActionsFor', { name })`. */
  accessibilityLabel: string
  /** Trigger icon size. Defaults to 16 to match list rows. */
  triggerSize?: number
  /** Trigger icon color. Defaults to `theme.colors.textAlt`. */
  triggerColor?: string
  /** Popover width. Defaults to 220. */
  contentWidth?: number
}

const DEFAULT_CONTENT_WIDTH = 220

/**
 * The app's standard row-level overflow menu: an ellipsis trigger that opens an
 * anchored popover of icon + label actions.
 *
 * Use this instead of swipe gestures for per-row edit/delete affordances so
 * every list exposes its actions the same discoverable way. Destructive actions
 * should route their confirmation through `@/lib/confirmDestructive`.
 */
const RowActionsMenu = ({
  actions,
  accessibilityLabel,
  triggerSize = 16,
  triggerColor,
  contentWidth = DEFAULT_CONTENT_WIDTH,
}: RowActionsMenuProps) => {
  const theme = useTheme()

  if (actions.length === 0) return null

  return (
    <AnchoredPopover
      contentWidth={contentWidth}
      contentStyle={{ padding: 4 }}
      renderTrigger={({ onPress, anchorRef }) => (
        <View ref={anchorRef} collapsable={false}>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={accessibilityLabel}
            onPress={onPress}
            hitSlop={10}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              paddingLeft: 2,
            })}
          >
            <LucideIcon
              icon={EllipsisIcon}
              color={triggerColor ?? theme.colors.textAlt}
              size={triggerSize}
            />
          </Pressable>
        </View>
      )}
    >
      {({ close }) =>
        actions.map((action) => {
          const color = action.destructive
            ? theme.colors.error
            : theme.colors.text

          return (
            <Pressable
              key={action.id}
              accessibilityRole='button'
              onPress={() => {
                close()
                action.onPress()
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: theme.numbers.borderRadiusSm,
              })}
            >
              <LucideIcon icon={action.icon} color={color} size={14} />
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {action.label}
              </Text>
            </Pressable>
          )
        })
      }
    </AnchoredPopover>
  )
}

export default RowActionsMenu
