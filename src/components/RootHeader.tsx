import { createContext, ReactNode, useContext, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native'
import { BlurView } from '@/components/ui/BlurView'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import useTheme from '@/contexts/theme'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'
import Text from '@/components/ui/MyText'
import AccountMenu from '@/components/AccountMenu'
import SidebarToggle from '@/components/ui/SidebarToggle'
import { isRtlLayout } from '@/lib/direction'
import { transparentToScreenReaders } from '@/lib/screenReader'
import WindowControlsInsetView, {
  NO_WINDOW_CONTROLS,
} from '../../modules/window-controls'

const clearOf = (inset: number) => (inset > 0 ? inset + 8 : 0)

const VERTICAL_BAR_WIDE_PADDING = 24

const TITLE_MIN_FIT_SCALE = 0.9

type TitleFit = { room: number; needs: number }

const TitleFitContext = createContext<TitleFit | undefined>(undefined)

export const useRootHeaderTitleFit = () => useContext(TitleFitContext)

const FLOAT_TRANSITION = {
  transitionDuration: 260,
  transitionTimingFunction: 'ease-in-out',
} as const

type Props = {
  title: string

  actions?: ReactNode

  children?: ReactNode

  contentStyle?: StyleProp<ViewStyle>

  onPressTitle?: () => void

  onLongPressTitle?: () => void

  floating?: boolean

  compact?: boolean
}

export default function RootHeader({
  title,
  actions,
  children,
  contentStyle,
  onPressTitle,
  onLongPressTitle,
  floating = false,
  compact = false,
}: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const isDark = theme.colors.background === '#121212'
  const [titleRoom, setTitleRoom] = useState<number>()
  const [titleWidth, setTitleWidth] = useState<number>()
  const [controls, setControls] = useState(NO_WINDOW_CONTROLS)
  const { isWide, navigationRail, hasSidebar, sidebarVisible } =
    useAdaptiveLayout()
  const titleFit =
    titleRoom === undefined || titleWidth === undefined
      ? undefined
      : { room: titleRoom, needs: titleWidth * TITLE_MIN_FIT_SCALE }
  const titleStyle = {
    fontFamily: theme.fonts.bold,
    fontSize: theme.fontSize('2xl'),
  }

  return (
    <View style={{ width: '100%' }}>
      {floating && (
        <View
          pointerEvents='none'
          style={[
            StyleSheet.absoluteFill,
            {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <BlurView
            tint={isDark ? 'dark' : 'light'}
            intensity={60}
            style={StyleSheet.absoluteFill}
          />
          {}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor:
                  theme.colors.card + (Platform.OS === 'android' ? 'e6' : '99'),
              },
            ]}
          />
        </View>
      )}
      <Animated.View
        style={[
          {
            paddingTop: insets.top + (compact ? 2 : 8),
            paddingHorizontal:
              navigationRail && isWide ? VERTICAL_BAR_WIDE_PADDING : 15,
            paddingBottom: compact ? 6 : 8,
            gap: compact ? 6 : 12,
            width: '100%',
            alignSelf: 'center',
            transitionProperty: ['paddingTop', 'paddingBottom', 'gap'],
            ...FLOAT_TRANSITION,
          },
          contentStyle,
        ]}
      >
        {}
        <WindowControlsInsetView onInsetsChange={setControls}>
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: compact ? 36 : 44,
              paddingStart: clearOf(controls.start),
              paddingEnd: clearOf(controls.end),
              transitionProperty: 'minHeight',
              ...FLOAT_TRANSITION,
            }}
          >
            <SidebarToggle mode='show' />
            {}
            {hasSidebar && sidebarVisible ? null : <AccountMenu />}
            <Pressable
              onPress={onPressTitle}
              onLongPress={onLongPressTitle}
              disabled={!onPressTitle && !onLongPressTitle}
              delayLongPress={800}
              onLayout={(e) => setTitleRoom(e.nativeEvent.layout.width)}
              style={{ flex: 1 }}
              {...(onPressTitle || onLongPressTitle
                ? { accessibilityRole: 'header' as const }
                : transparentToScreenReaders)}
            >
              {}
              <Animated.View
                style={{
                  transformOrigin: isRtlLayout()
                    ? 'right center'
                    : 'left center',
                  transform: [{ scale: compact ? 0.82 : 1 }],
                  transitionProperty: 'transform',
                  ...FLOAT_TRANSITION,
                }}
              >
                {}
                <Text
                  accessibilityRole='header'
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={titleStyle}
                >
                  {title}
                </Text>
              </Animated.View>
            </Pressable>
            {actions && (
              <TitleFitContext value={titleFit}>
                {}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 24,
                  }}
                >
                  {actions}
                </View>
              </TitleFitContext>
            )}
            {actions && (
              <View
                pointerEvents='none'
                accessibilityElementsHidden
                importantForAccessibility='no-hide-descendants'
                style={{
                  position: 'absolute',
                  width: 9999,
                  flexDirection: 'row',
                  opacity: 0,
                }}
              >
                <Text
                  numberOfLines={1}
                  onLayout={(e) => setTitleWidth(e.nativeEvent.layout.width)}
                  style={titleStyle}
                >
                  {title}
                </Text>
              </View>
            )}
          </Animated.View>
        </WindowControlsInsetView>
      </Animated.View>
      {children}
    </View>
  )
}
