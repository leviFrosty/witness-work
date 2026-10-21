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

/** SwiftUI `Menu`: a tap opens the menu from the trigger. */
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
  // Hosted RN content sizes to its own content, so a filling trigger gets the
  // width the surrounding layout gives it passed down explicitly.
  const [width, setWidth] = useState<number>()
  const [hovered, setHovered] = useState(false)
  const groups = menuGroups(actions)
  if (!groups.length) return null

  const tint = pointerEffect === 'tint'
  // The menu opens only from its label, so no slop can grow the default
  // ellipsis: it gets a real 44pt frame instead, which the host's negative
  // margins keep from moving anything.
  const target: ViewStyle = children ? {} : touchTargetFrame(triggerSize)
  const { marginHorizontal, marginVertical, ...frame } = target
  // VoiceOver reads the menu itself, a native pop-up button.
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
      // Taps on the label land in SwiftUI, so React Native reports them here,
      // on its nearest view. SwiftUI reports no open, but this tap opens it.
      onTouchStart={onOpen}
      onLayout={
        fill ? (event) => setWidth(event.nativeEvent.layout.width) : undefined
      }
    >
      {/* The pointer, like the tap, never reaches the hosted label, so the
          host takes the hover. */}
      <PointerHover
        effect={tint ? 'none' : pointerEffect}
        onHoverChange={tint ? setHovered : undefined}
      >
        {/* Without ignoreSafeArea, triggers first laid out under the home
            indicator measure short. */}
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
