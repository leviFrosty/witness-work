import { Menu as MenuIcon, X as XIcon } from 'lucide-react-native'
import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { type LayoutChangeEvent, Platform, Pressable, View } from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import Text from '@/components/ui/MyText'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import { cloneElement, isValidElement, useState } from 'react'
import WindowControlsInsetView, {
  NO_WINDOW_CONTROLS,
} from '../../../../modules/window-controls'

type Props = {
  backgroundColor?: string
  inverseTextAndIconColor?: boolean
  /**
   * Hard override for the chevron + title color. Wins over
   * `inverseTextAndIconColor` so callers can react to a dynamic background
   * (e.g. a contact's hero tint) and keep contrast.
   */
  foregroundColor?: string
  title?: string
  buttonType?: 'exit' | 'settings' | 'back' | 'none'
  onPressLeftIcon?: () => void
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
  noBottomBorder?: boolean
  noInsets?: boolean
  /**
   * Optional long-press handler on the title. Used for hidden dev affordances
   * (e.g. resetting the milestone-reveal flags from the home header). Pure
   * pass-through — Header doesn't add visual chrome to indicate it's
   * long-pressable. Keeps an invisible target when there's no title.
   */
  onLongPressTitle?: () => void
}

/** Room between the title and the buttons beside it. */
const TITLE_GAP = 8

// The nested provider measures the header's own safe area, so a screen pushed
// inside an iOS modal sheet gets no status-bar inset instead of the window's.
const Header = (props: Props) => (
  <SafeAreaProvider style={{ flex: 0 }}>
    <HeaderContent {...props} />
  </SafeAreaProvider>
)

const HeaderContent = ({
  title,
  buttonType,
  rightElement,
  leftElement,
  backgroundColor,
  inverseTextAndIconColor,
  foregroundColor,
  noBottomBorder,
  noInsets,
  onPressLeftIcon,
  onLongPressTitle,
}: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  // A windowed iPad app keeps its window controls over the top corner, right
  // where the back button sits.
  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)
  // The buttons float over the header's ends. The title keeps clear of the
  // wider side on both sides, so it stays centered and a title that wraps
  // (large text, long translations) never runs under them.
  const [leftWidth, setLeftWidth] = useState(0)
  const [rightWidth, setRightWidth] = useState(0)
  const titleInset = Math.max(controls.start + leftWidth, rightWidth)
  const widthSetter =
    (set: (width: number) => void) => (e: LayoutChangeEvent) =>
      set(Math.round(e.nativeEvent.layout.width))
  // At accessibility text sizes the title wraps between words and shrinks
  // rather than breaking a word that doesn't fit between the buttons.
  const titleFit = useAccessibilityTextSize()
    ? {
        numberOfLines: Math.min(title?.trim().split(/\s+/).length ?? 1, 3),
        adjustsFontSizeToFit: true,
        minimumFontScale: 0.5,
      }
    : undefined

  const handleButtonAction = () => {
    if (onPressLeftIcon) {
      return onPressLeftIcon()
    }
    if (buttonType === 'exit') {
      navigation.popToTop()
    }
    if (buttonType === 'back') {
      navigation.goBack()
    }
  }

  const iconName = (): AppIcon => {
    if (buttonType === 'settings') {
      return MenuIcon
    }
    if (buttonType === 'exit') {
      return XIcon
    }
    if (buttonType === 'back') {
      return ChevronBackwardIcon
    }

    return MenuIcon
  }

  const buttonLabel = (): string | undefined => {
    if (buttonType === 'exit') {
      return i18n.t('close')
    }
    if (buttonType === 'back') {
      return i18n.t('goBack')
    }
  }

  return (
    <View
      style={{
        backgroundColor: backgroundColor || theme.colors.background,
        paddingTop:
          Platform.OS === 'ios' && (noInsets || insets.top === 0)
            ? 10
            : insets.top,
        borderBottomWidth: noBottomBorder ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <WindowControlsInsetView
        onInsetsChange={setControls}
        style={{
          position: 'relative',
          flexGrow: 1,
          marginHorizontal: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 12,
        }}
      >
        {leftElement ? (
          <View
            onLayout={widthSetter(setLeftWidth)}
            style={{ position: 'absolute', left: controls.start }}
          >
            {leftElement}
          </View>
        ) : (
          buttonType !== 'none' && (
            <View
              onLayout={widthSetter(setLeftWidth)}
              style={{ position: 'absolute', left: controls.start }}
            >
              <IconButton
                onPress={handleButtonAction}
                icon={iconName()}
                accessibilityLabel={buttonLabel()}
                hitSlop={24}
                iconStyle={{
                  color:
                    foregroundColor ??
                    (inverseTextAndIconColor
                      ? theme.colors.textInverse
                      : theme.colors.text),
                }}
                size={'xl'}
              />
            </View>
          )
        )}
        <Pressable
          onLongPress={onLongPressTitle}
          disabled={!onLongPressTitle}
          delayLongPress={800}
          style={[
            {
              flexShrink: 1,
              marginHorizontal: titleInset > 0 ? titleInset + TITLE_GAP : 0,
            },
            onLongPressTitle && !title && { minWidth: 120, minHeight: 24 },
          ]}
        >
          <Text
            {...titleFit}
            style={{
              textAlign: 'center',
              fontSize: 18,
              fontFamily: theme.fonts.semiBold,
              color:
                foregroundColor ??
                (inverseTextAndIconColor
                  ? theme.colors.textInverse
                  : theme.colors.text),
            }}
          >
            {title}
          </Text>
        </Pressable>
        {isValidElement<{ onLayout?: (e: LayoutChangeEvent) => void }>(
          rightElement
        )
          ? cloneElement(rightElement, {
              onLayout: widthSetter(setRightWidth),
            })
          : rightElement}
      </WindowControlsInsetView>
    </View>
  )
}

export default Header
