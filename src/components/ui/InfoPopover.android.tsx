import { Host } from '@expo/ui'
import {
  RNHostView,
  Text,
  TooltipBox,
  type TooltipBoxRef,
} from '@expo/ui/jetpack-compose'
import { useNavigation } from '@react-navigation/native'
import { useEffect, useRef } from 'react'
import { Keyboard } from 'react-native'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import InfoPopoverTrigger, {
  infoPopoverHostStyle,
  type InfoPopoverProps,
} from '@/components/ui/InfoPopoverTrigger'

/**
 * A Material 3 rich tooltip, persistent until a tap outside or Back, which is
 * what Material uses for optional details behind an info icon. Compose doesn't
 * report when it closes, so the trigger carries no expanded state.
 */
export default function InfoPopover({
  title,
  description,
  inline,
  ...trigger
}: InfoPopoverProps) {
  const theme = useTheme()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const navigation = useNavigation()
  const tooltip = useRef<TooltipBoxRef>(null)

  // The tooltip lives in its own window, which would stay over the next screen.
  // Dismissing one that has already left composition rejects; nothing's open.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        tooltip.current?.dismiss().catch(() => {})
      }),
    [navigation]
  )

  return (
    <Host
      matchContents
      colorScheme={colorScheme}
      style={infoPopoverHostStyle(inline)}
    >
      <TooltipBox
        ref={tooltip}
        isPersistent
        focusable
        // The RN trigger owns its touches; Compose never sees them.
        enableUserInput={false}
      >
        <TooltipBox.RichTooltip
          containerColor={theme.colors.card}
          contentColor={theme.colors.text}
          titleContentColor={theme.colors.text}
        >
          <TooltipBox.RichTooltip.Title>
            <Text>{title}</Text>
          </TooltipBox.RichTooltip.Title>
          <TooltipBox.RichTooltip.Text>
            <Text>{description}</Text>
          </TooltipBox.RichTooltip.Text>
        </TooltipBox.RichTooltip>
        <RNHostView matchContents>
          <InfoPopoverTrigger
            title={title}
            {...trigger}
            onPress={() => {
              Keyboard.dismiss()
              void tooltip.current?.show()
            }}
          />
        </RNHostView>
      </TooltipBox>
    </Host>
  )
}
