import { Host } from '@expo/ui'
import { Popover, RNHostView, Text, VStack } from '@expo/ui/swift-ui'
import {
  accessibilityAddTraits,
  fixedSize,
  font,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers'
import { useNavigation } from '@react-navigation/native'
import { useEffect, useId, useState } from 'react'
import { Keyboard, useWindowDimensions } from 'react-native'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import { usePopoverTouchShield } from '@/components/ui/popoverTouchShield'
import { usePreferences } from '@/stores/preferences'
import InfoPopoverTrigger, {
  infoPopoverHostStyle,
  type InfoPopoverProps,
} from '@/components/ui/InfoPopoverTrigger'

const PADDING = 16

export default function InfoPopover({
  title,
  description,
  inline,
  ...trigger
}: InfoPopoverProps) {
  const colorScheme = usePreferences((s) => s.colorScheme)
  const navigation = useNavigation()
  const { width } = useWindowDimensions()
  const [open, setOpen] = useState(false)
  const holdId = useId()
  useTakeoverHold(`popover:${holdId}`, open)
  usePopoverTouchShield(`popover:${holdId}`, open)

  useEffect(
    () => navigation.addListener('blur', () => setOpen(false)),
    [navigation]
  )

  return (
    <Host
      matchContents
      colorScheme={colorScheme}
      ignoreSafeArea='all'
      style={infoPopoverHostStyle(inline)}
    >
      <Popover isPresented={open} onIsPresentedChange={setOpen}>
        <Popover.Trigger>
          <RNHostView matchContents>
            <InfoPopoverTrigger
              title={title}
              {...trigger}
              expanded={open}
              onPress={() => {
                Keyboard.dismiss()
                setOpen(true)
              }}
            />
          </RNHostView>
        </Popover.Trigger>
        <Popover.Content>
          <VStack
            alignment='leading'
            spacing={6}
            modifiers={[
              padding({ all: PADDING }),
              frame({
                width: Math.min(300, width - 40) - PADDING * 2,
                alignment: 'leading',
              }),
            ]}
          >
            <Text
              modifiers={[
                font({ textStyle: 'headline' }),
                accessibilityAddTraits(['isHeader']),
              ]}
            >
              {title}
            </Text>
            <Text
              modifiers={[
                font({ textStyle: 'subheadline' }),
                fixedSize({ horizontal: false, vertical: true }),
              ]}
            >
              {description}
            </Text>
          </VStack>
        </Popover.Content>
      </Popover>
    </Host>
  )
}
