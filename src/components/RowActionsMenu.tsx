import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View } from 'react-native'

import useTheme from '@/contexts/theme'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import LucideIcon, { AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'

export interface RowAction {
  /** Stable key for the row. */
  id: string
  label: string
  icon: AppIcon
  /** Renders the row in the error color — pair with `confirmDestructive`. */
  destructive?: boolean
  /**
   * Runs once the popover's Modal has fully dismissed, so alerts, share sheets
   * and navigation opened here land on a screen with no popover in front.
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
          <PointerHover effect='highlight'>
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={accessibilityLabel}
              onPress={onPress}
              hitSlop={10}
              // Padding (cancelled by the margin) gives the pointer highlight
              // room around the icon without moving it.
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                padding: 4,
                paddingLeft: 6,
                margin: -4,
                borderRadius: theme.numbers.borderRadiusSm,
              })}
            >
              <LucideIcon
                icon={EllipsisIcon}
                color={triggerColor ?? theme.colors.textAlt}
                size={triggerSize}
              />
            </Pressable>
          </PointerHover>
        </View>
      )}
    >
      {({ closeThen }) =>
        actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            onPress={() => closeThen(action.onPress)}
          />
        ))
      }
    </AnchoredPopover>
  )
}

const ActionRow = ({
  action,
  onPress,
}: {
  action: RowAction
  onPress: () => void
}) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)
  const color = action.destructive ? theme.colors.error : theme.colors.text

  return (
    <PointerHover onHoverChange={setHovered}>
      <Pressable
        accessibilityRole='button'
        onPress={onPress}
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
        <HoverTint
          visible={hovered}
          borderRadius={theme.numbers.borderRadiusSm}
        />
      </Pressable>
    </PointerHover>
  )
}

export default RowActionsMenu
