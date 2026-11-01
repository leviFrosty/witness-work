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

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        Promise.resolve(tooltip.current?.dismiss()).catch(() => {})
      }),
    [navigation]
  )

  return (
    <Host
      matchContents
      colorScheme={colorScheme}
      style={infoPopoverHostStyle(inline)}
    >
      <TooltipBox ref={tooltip} isPersistent focusable enableUserInput={false}>
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

              Promise.resolve(tooltip.current?.show()).catch(() => {})
            }}
          />
        </RNHostView>
      </TooltipBox>
    </Host>
  )
}
