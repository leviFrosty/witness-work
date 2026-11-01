import { ReactNode, Ref, useState } from 'react'
import { Platform, View } from 'react-native'
import { Collapsible, Host, RNHostView } from '@expo/ui'
import { useCardStyle } from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { alignText } from '@/lib/direction'
import { postScriptName } from '@/lib/postScriptName'

const CARD_PADDING = Platform.OS === 'android' ? 4 : 16

const ACCESSORY_END = Platform.OS === 'android' ? 52 : 36
const CONTENT_INSET =
  2 + CARD_PADDING * 2 + (Platform.OS === 'android' ? 32 : 0)

type Props = {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void

  children: ReactNode

  accessory?: ReactNode
  testID?: string
  ref?: Ref<View>
}

export default function CollapsibleCard({
  label,
  open,
  onOpenChange,
  children,
  accessory,
  testID,
  ref,
}: Props) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const colorScheme = usePreferences((s) => s.colorScheme)
  const [width, setWidth] = useState<number>()
  const contentWidth = width && width - CONTENT_INSET
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)

  const [headerHeight, setHeaderHeight] = useState<number>()

  return (
    <View
      ref={ref}
      testID={testID}
      style={[cardStyle, { padding: CARD_PADDING }]}
      onLayout={(event) => {
        const { layout } = event.nativeEvent
        setWidth(layout.width)

        if (!opened) setHeaderHeight(layout.height - CARD_PADDING * 2)
      }}
    >
      {}
      <Host
        matchContents={{ vertical: true }}
        colorScheme={colorScheme}
        seedColor={theme.colors.accent}
        ignoreSafeArea='all'
      >
        <Collapsible
          isOpen={open}
          onOpenChange={onOpenChange}
          label={label}
          stateDescription={i18n.t(open ? 'a11y_expanded' : 'a11y_collapsed')}
          labelStyle={{
            fontFamily:
              Platform.OS === 'ios'
                ? postScriptName(theme.fonts.semiBold)
                : theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
            color: theme.colors.text,
            textAlign: alignText('start'),
          }}
        >
          {opened && contentWidth ? (
            <RNHostView matchContents>
              <View
                style={{
                  width: contentWidth,
                  paddingTop: Platform.OS === 'ios' ? 12 : 0,
                }}
              >
                {children}
              </View>
            </RNHostView>
          ) : null}
        </Collapsible>
      </Host>
      {accessory && headerHeight ? (
        <View
          style={{
            position: 'absolute',
            top: CARD_PADDING + headerHeight / 2 - 22,
            end: ACCESSORY_END,
          }}
        >
          {accessory}
        </View>
      ) : null}
    </View>
  )
}
