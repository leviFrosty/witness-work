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

  foregroundColor?: string
  title?: string
  buttonType?: 'exit' | 'settings' | 'back' | 'none'
  onPressLeftIcon?: () => void
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
  noBottomBorder?: boolean
  noInsets?: boolean

  onLongPressTitle?: () => void
}

const TITLE_GAP = 8

const Header = (props: Props) => {
  const systemBack = useSystemBackButton(
    props.buttonType === 'back' && !props.leftElement && !props.onPressLeftIcon
  )

  if (systemBack) return <HeaderContent {...props} systemBack />

  return (
    <SafeAreaProvider style={{ flex: 0 }}>
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

  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)

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

  const [leftWidth, setLeftWidth] = useState(0)
  const [rightWidth, setRightWidth] = useState(0)
  const titleInset = Math.max(
    controls.start + (systemBack ? 0 : leftWidth),
    controls.end + rightWidth
  )
  const widthSetter =
    (set: (width: number) => void) => (e: LayoutChangeEvent) =>
      set(Math.round(e.nativeEvent.layout.width))

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
        {}
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
