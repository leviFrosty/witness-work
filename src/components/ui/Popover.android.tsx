import { Host } from '@expo/ui'
import { DropdownMenu, RNHostView } from '@expo/ui/jetpack-compose'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import {
  PopoverContent,
  usePopoverPresentation,
} from '@/components/ui/popoverPresentation'
import type { PopoverProps } from '@/components/ui/Popover.types'

/**
 * Material 3 menu surface anchored to its trigger, holding arbitrary content.
 * It opens below the trigger, or above it when there's more room there, and
 * closes on a tap outside or Back.
 */
export default function Popover({
  renderTrigger,
  contentWidth,
  contentStyle,
  backgroundColor,
  style,
  children,
}: PopoverProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const popover = usePopoverPresentation({
    // The menu's 48dp margin from the window edge and its 8dp padding.
    edge: 64,
    // Compose doesn't report when the exit animation ends.
    dismissFallbackMs: 200,
  })

  return (
    <Host matchContents colorScheme={colorScheme} style={style}>
      <DropdownMenu
        expanded={popover.open}
        onDismissRequest={() => popover.setPresented(false)}
        color={backgroundColor ?? theme.colors.card}
      >
        <DropdownMenu.Trigger>
          <RNHostView matchContents>
            <View ref={popover.triggerRef} collapsable={false}>
              {renderTrigger({ onPress: popover.show, expanded: popover.open })}
            </View>
          </RNHostView>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          <RNHostView matchContents>
            <View>
              {popover.mounted ? (
                <PopoverContent
                  contentRef={popover.contentRef}
                  width={contentWidth}
                  maxHeight={popover.maxHeight}
                  style={contentStyle}
                  controls={popover.controls}
                  onLayout={popover.contentLaidOut}
                >
                  {typeof children === 'function'
                    ? children(popover.controls)
                    : children}
                </PopoverContent>
              ) : null}
            </View>
          </RNHostView>
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  )
}
