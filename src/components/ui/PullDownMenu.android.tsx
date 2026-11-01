import { Host } from '@expo/ui'
import { DropdownMenu, RNHostView } from '@expo/ui/jetpack-compose'
import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import MenuItems from '@/components/ui/MenuItems.android'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { menuGroups } from '@/components/ui/menuEntries'
import { touchTargetFrame } from '@/components/ui/touchTarget'
import type { ContextMenuSubmenu } from '@/components/ui/ContextMenu.types'
import type { PullDownMenuProps } from '@/components/ui/PullDownMenu.types'
import { usePreferences } from '@/stores/preferences'

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
  const colorScheme = usePreferences((s) => s.colorScheme)
  const [expanded, setExpanded] = useState(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)

  const [width, setWidth] = useState<number>()

  const [hovered, setHovered] = useState(false)
  const groups = menuGroups(actions)
  if (!groups.length) return null

  const target: ViewStyle = children ? {} : touchTargetFrame(triggerSize)
  const { marginHorizontal, marginVertical, ...frame } = target

  const open = () => {
    onOpen?.()
    setSubmenu(null)
    setExpanded(true)
  }

  const close = () => {
    setExpanded(false)
    setSubmenu(null)
  }

  return (
    <View
      style={style}
      onLayout={
        fill
          ? (event) => setWidth(Math.ceil(event.nativeEvent.layout.width))
          : undefined
      }
    >
      <Host
        matchContents
        colorScheme={colorScheme}
        style={{ marginHorizontal, marginVertical }}
      >
        <DropdownMenu
          expanded={expanded}
          onDismissRequest={close}
          color={theme.colors.card}
        >
          <DropdownMenu.Trigger>
            <RNHostView matchContents>
              <PointerHover
                onHoverChange={
                  pointerEffect === 'tint' ? setHovered : undefined
                }
              >
                {}
                <Pressable
                  onPress={open}
                  accessibilityRole='button'
                  accessibilityLabel={accessibilityLabel}
                  accessibilityHint={accessibilityHint}
                  accessibilityValue={
                    accessibilityValue === undefined
                      ? undefined
                      : { text: accessibilityValue }
                  }
                  accessibilityState={{ expanded }}
                  pointerEvents='box-only'
                  testID={testID}
                  style={({ pressed }) => [
                    frame,
                    { borderRadius: hoverRadius },
                    width !== undefined && { width },
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
                  <HoverTint visible={hovered} borderRadius={hoverRadius} />
                </Pressable>
              </PointerHover>
            </RNHostView>
          </DropdownMenu.Trigger>
          <DropdownMenu.Items>
            <MenuItems
              groups={groups}
              submenu={submenu}
              onSubmenuChange={setSubmenu}
              onSelect={(action) => {
                close()
                action.onPress()
              }}
            />
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
    </View>
  )
}
