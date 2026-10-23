import { Host } from '@expo/ui'
import { Group, Popover as SwiftPopover, RNHostView } from '@expo/ui/swift-ui'
import {
  onDisappear,
  presentationBackground,
} from '@expo/ui/swift-ui/modifiers'
import { View } from 'react-native'
import { usePreferences } from '@/stores/preferences'
import {
  PopoverContent,
  usePopoverPresentation,
} from '@/components/ui/popoverPresentation'
import type { PopoverProps } from '@/components/ui/Popover.types'

/**
 * SwiftUI popover anchored to its trigger. It stays a popover on iPhone
 * (`presentationCompactAdaptation(.popover)`) rather than becoming a sheet, and
 * presents over natively presented screens and form sheets.
 */
export default function Popover({
  renderTrigger,
  contentWidth,
  contentStyle,
  backgroundColor,
  style,
  children,
}: PopoverProps) {
  const colorScheme = usePreferences((s) => s.colorScheme)
  const popover = usePopoverPresentation({
    // Arrow, gap and the system's margin from the screen edge.
    edge: 40,
    dismissFallbackMs: 600,
  })

  return (
    <Host
      matchContents
      colorScheme={colorScheme}
      // Without this, triggers first laid out under the home indicator
      // measure short.
      ignoreSafeArea='all'
      style={style}
    >
      <SwiftPopover
        isPresented={popover.open}
        onIsPresentedChange={popover.setPresented}
      >
        <SwiftPopover.Trigger>
          <RNHostView matchContents>
            <View ref={popover.triggerRef} collapsable={false}>
              {renderTrigger({ onPress: popover.show, expanded: popover.open })}
            </View>
          </RNHostView>
        </SwiftPopover.Trigger>
        <SwiftPopover.Content>
          <Group
            modifiers={[
              onDisappear(popover.dismissed),
              ...(backgroundColor
                ? [presentationBackground(backgroundColor)]
                : []),
            ]}
          >
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
          </Group>
        </SwiftPopover.Content>
      </SwiftPopover>
    </Host>
  )
}
