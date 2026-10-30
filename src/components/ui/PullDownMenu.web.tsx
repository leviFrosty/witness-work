import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { menuGroups } from '@/components/ui/menuEntries'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import WebLayer, { useAnchor } from '@/components/ui/web/WebLayer'
import WebMenu from '@/components/ui/web/WebMenu'
import type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

export type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'

/**
 * A menu anchored to its trigger, opened by a click, Enter or Space
 * (`web/WebMenu.tsx` has the keyboard behavior). The default ellipsis grows to
 * a 44pt target; a trigger of your own fills the width its container gives it
 * with `fill`, and its menu is at least as wide.
 */
export default function PullDownMenu({
  actions,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  children,
  triggerSize = 20,
  triggerColor,
  pointerEffect = 'highlight',
  hoverRadius,
  fill = false,
  onOpen,
  style,
  testID,
}: PullDownMenuProps) {
  const theme = useTheme()
  const [anchor, anchorRef] = useAnchor()
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const groups = menuGroups(actions)
  if (!groups.length) return null

  const frame: ViewStyle = children ? {} : touchTargetFrame(triggerSize)

  return (
    <View style={[fill && { alignSelf: 'stretch' }, style]}>
      <PointerHover onHoverChange={setHovered}>
        <Pressable
          ref={anchorRef}
          onPress={() => {
            if (!open) onOpen?.()
            setOpen(!open)
          }}
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          accessibilityValue={
            accessibilityValue === undefined
              ? undefined
              : { text: accessibilityValue }
          }
          accessibilityState={{ expanded: open }}
          aria-haspopup='menu'
          aria-expanded={open}
          testID={testID}
          style={({ pressed }) => [
            frame,
            { borderRadius: hoverRadius },
            pressed && { opacity: 0.7 },
          ]}
        >
          {children ?? (
            <LucideIcon
              icon={EllipsisIcon}
              color={triggerColor ?? theme.colors.textAlt}
              size={triggerSize}
            />
          )}
          <HoverTint
            visible={hovered && pointerEffect !== 'none'}
            borderRadius={hoverRadius ?? (children ? undefined : 999)}
          />
        </Pressable>
      </PointerHover>
      <WebLayer
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        role='menu'
        label={accessibilityLabel}
        matchAnchorWidth={fill}
        placement={{ align: children ? 'start' : 'end' }}
      >
        <WebMenu
          groups={groups}
          onSelect={(action) => {
            setOpen(false)
            action.onPress()
          }}
        />
      </WebLayer>
    </View>
  )
}
