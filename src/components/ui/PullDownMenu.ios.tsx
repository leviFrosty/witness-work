import { Host } from '@expo/ui'
import { Menu, RNHostView } from '@expo/ui/swift-ui'
import {
  accessibilityHint as hintModifier,
  accessibilityIdentifier,
  accessibilityLabel as labelModifier,
  accessibilityValue as valueModifier,
} from '@expo/ui/swift-ui/modifiers'
import { Ellipsis as EllipsisIcon } from 'lucide-react-native'
import { useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import MenuItems from '@/components/ui/MenuItems.ios'
import PointerHover, { HoverTint } from '@/components/ui/PointerHover'
import { menuGroups } from '@/components/ui/menuEntries'
import { touchTargetFrame } from '@/components/ui/touchTarget'
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

  const [width, setWidth] = useState<number>()
  const [hovered, setHovered] = useState(false)
  const groups = menuGroups(actions)
  if (!groups.length) return null

  const tint = pointerEffect === 'tint'

  const target: ViewStyle = children ? {} : touchTargetFrame(triggerSize)
  const { marginHorizontal, marginVertical, ...frame } = target

  const a11y = [
    labelModifier(accessibilityLabel),
    ...(accessibilityValue === undefined
      ? []
      : [valueModifier(accessibilityValue)]),
    ...(accessibilityHint ? [hintModifier(accessibilityHint)] : []),
    ...(testID ? [accessibilityIdentifier(testID)] : []),
  ]

  return (
    <View
      style={style}
      onTouchStart={onOpen}
      onLayout={
        fill ? (event) => setWidth(event.nativeEvent.layout.width) : undefined
      }
    >
      {}
      <PointerHover
        effect={tint ? 'none' : pointerEffect}
        onHoverChange={tint ? setHovered : undefined}
      >
        {}
        <Host
          matchContents
          colorScheme={colorScheme}
          ignoreSafeArea='all'
          style={{
            borderRadius: hoverRadius,
            marginHorizontal,
            marginVertical,
          }}
        >
          <Menu
            modifiers={a11y}
            label={
              <RNHostView matchContents>
                <View
                  accessibilityElementsHidden
                  style={[
                    frame,
                    { borderRadius: hoverRadius },
                    width !== undefined && { width },
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
                    visible={tint && hovered}
                    borderRadius={hoverRadius}
                  />
                </View>
              </RNHostView>
            }
          >
            <MenuItems groups={groups} />
          </Menu>
        </Host>
      </PointerHover>
    </View>
  )
}
