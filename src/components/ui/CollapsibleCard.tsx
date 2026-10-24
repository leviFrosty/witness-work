import { ReactNode, Ref, useState } from 'react'
import { Platform, View } from 'react-native'
import { Collapsible, Host, RNHostView } from '@expo/ui'
import { useCardStyle } from '@/components/ui/Card'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { alignText } from '@/lib/direction'
import { postScriptName } from '@/lib/postScriptName'

// Compose's Collapsible pads its own header and content (16dp each side).
const CARD_PADDING = Platform.OS === 'android' ? 4 : 16
/**
 * From the card's trailing edge to an accessory's 44pt frame, clear of the
 * chevron: SwiftUI's sits at the card's padding, Compose's 16dp inside it.
 */
const ACCESSORY_END = Platform.OS === 'android' ? 52 : 36
const CONTENT_INSET =
  2 + CARD_PADDING * 2 + (Platform.OS === 'android' ? 32 : 0)

type Props = {
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** React Native content, laid out at the width left inside the card. */
  children: ReactNode
  /**
   * A button beside the disclosure chevron, e.g. one that opens the content
   * full screen. Keep it to one icon: it sits over the header's trailing end.
   */
  accessory?: ReactNode
  testID?: string
  ref?: Ref<View>
}

/**
 * A card with a native disclosure header (SwiftUI's `DisclosureGroup`,
 * Compose's expandable list item) that shows React Native content under it,
 * e.g. a form kept out of the way until it's wanted. The content mounts the
 * first time it opens and keeps its state while closed.
 */
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
  // The header's height, read while the card is closed, to center the
  // accessory on it.
  const [headerHeight, setHeaderHeight] = useState<number>()

  return (
    <View
      ref={ref}
      testID={testID}
      style={[cardStyle, { padding: CARD_PADDING }]}
      onLayout={(event) => {
        const { layout } = event.nativeEvent
        setWidth(layout.width)
        // Only until the content first mounts: the native header opens itself
        // before `open` turns true here, so a later "closed" layout can
        // already hold the content and drop the accessory onto it.
        if (!opened) setHeaderHeight(layout.height - CARD_PADDING * 2)
      }}
    >
      {/* Without ignoreSafeArea, SwiftUI insets cards laid out under the
      header or home indicator, shifting the label and clipping the content. */}
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
          // SwiftUI's DisclosureGroup announces its own state; Compose's
          // header reads this one.
          stateDescription={i18n.t(open ? 'a11y_expanded' : 'a11y_collapsed')}
          labelStyle={{
            // SwiftUI looks fonts up by PostScript name, not the expo-font
            // alias.
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
