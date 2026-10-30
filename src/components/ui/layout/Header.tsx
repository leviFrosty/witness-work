import { Menu as MenuIcon, X as XIcon } from 'lucide-react-native'
import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import type { AppIcon } from '@/components/ui/LucideIcon'
import {
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useUnbrokenWords from '@/hooks/useUnbrokenWords'
import Text from '@/components/ui/MyText'
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context'
import { isRtlLayout } from '@/lib/direction'
import { transparentToScreenReaders } from '@/lib/screenReader'
import { useNavigation } from '@react-navigation/native'
import IconButton from '@/components/ui/IconButton'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'
import { cloneElement, isValidElement, useState } from 'react'
import WindowControlsInsetView, {
  NO_WINDOW_CONTROLS,
} from '../../../../modules/window-controls'
import DisplayRegionsView from '../../../../modules/display-regions'
import { useSystemBackButton } from '@/components/ui/layout/SystemBackButton'
import { useLocalFoldPane } from '@/components/ui/layout/FoldPane'

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

const Header = (props: Props) => {
  // Where the navigation bar draws Back (iPhone Duo's vertical bar), ours
  // steps aside.
  const systemBack = useSystemBackButton(
    props.buttonType === 'back' && !props.leftElement && !props.onPressLeftIcon
  )
  // The window's insets, as the bar's own (in the screen's safe area) would
  // push the header below it. Pushed screens are never in a sheet.
  if (systemBack) return <HeaderContent {...props} systemBack />

  // The nested provider measures the header's own safe area, so a screen pushed
  // inside an iOS modal sheet gets no status-bar inset instead of the window's.
  // Sized by its content: on the web the provider's flex basis is 0%, which
  // collapses the header under the screen below it, and that covers its buttons.
  return (
    <SafeAreaProvider style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }}>
      <HeaderContent {...props} systemBack={false} />
    </SafeAreaProvider>
  )
}

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
  systemBack,
}: Props & { systemBack: boolean }) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  // A windowed iPad app keeps its window controls over a top corner: the back
  // button's, or the end buttons' when the app and the system read in
  // different directions (Arabic on an English iPad, or the reverse).
  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)
  // While iPhone Duo is partly folded, the title and buttons keep to the
  // leading side of the fold, above the content they belong to; the bar's
  // background still spans the window.
  const { onRegionsChange, pane } = useLocalFoldPane()
  const rtl = isRtlLayout()
  const startInset = Math.max(
    rtl ? insets.right : insets.left,
    (rtl ? pane?.right : pane?.left) ?? 0
  )
  const endInset = Math.max(
    rtl ? insets.left : insets.right,
    (rtl ? pane?.left : pane?.right) ?? 0
  )
  // The buttons float over the header's ends. The title keeps clear of the
  // wider side on both sides, so it stays centered and a title that wraps
  // (large text, long translations) never runs under them.
  const [leftWidth, setLeftWidth] = useState(0)
  const [rightWidth, setRightWidth] = useState(0)
  const titleInset = Math.max(
    controls.start + (systemBack ? 0 : leftWidth),
    controls.end + rightWidth
  )
  const widthSetter =
    (set: (width: number) => void) => (e: LayoutChangeEvent) =>
      set(Math.round(e.nativeEvent.layout.width))
  // At accessibility text sizes the title wraps between words and shrinks
  // rather than breaking a word that doesn't fit between the buttons.
  const largeText = useAccessibilityTextSize()
  const unbroken = useUnbrokenWords(title ?? '', largeText)
  const titleFit = largeText
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
      <DisplayRegionsView
        style={StyleSheet.absoluteFill}
        onRegionsChange={onRegionsChange}
      />
      <WindowControlsInsetView
        onInsetsChange={setControls}
        style={{
          position: 'relative',
          flexGrow: 1,
          // Stack headers sit outside the screen's horizontal safe area. Insets
          // are physical; React Native mirrors left and right margins in RTL.
          marginLeft: 15 + startInset,
          marginRight: 15 + endInset,
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
          buttonType !== 'none' &&
          !systemBack && (
            <View
              onLayout={widthSetter(setLeftWidth)}
              style={{ position: 'absolute', left: controls.start }}
            >
              <IconButton
                onPress={handleButtonAction}
                icon={iconName()}
                accessibilityLabel={buttonLabel()}
                hitSlop={24}
                // React Native Web ignores `hitSlop`; a real frame keeps the
                // 44pt target there without moving the glyph.
                frame={Platform.OS === 'web'}
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
          // Without a long press the title itself is the heading, rather
          // than a disabled element around it.
          {...(onLongPressTitle
            ? { accessibilityRole: 'header' as const }
            : transparentToScreenReaders)}
        >
          <Text
            {...titleFit}
            accessibilityRole='header'
            onTextLayout={largeText ? unbroken.onTextLayout : undefined}
            style={{
              textAlign: 'center',
              fontSize: 18 * unbroken.scale,
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
        {/* Callers pin their buttons to the end (`right: 0`); this keeps
            that end clear of the window controls. */}
        <View
          pointerEvents='box-none'
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            start: 0,
            end: controls.end,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isValidElement<{ onLayout?: (e: LayoutChangeEvent) => void }>(
            rightElement
          )
            ? cloneElement(rightElement, {
                onLayout: widthSetter(setRightWidth),
              })
            : rightElement}
        </View>
      </WindowControlsInsetView>
    </View>
  )
}

export default Header
