import {
  BookUser as BookUserIcon,
  CalendarDays as CalendarDaysIcon,
  ChartLine as ChartLineIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
  House as HouseIcon,
  MapPinned as MapPinnedIcon,
  Plus as PlusIcon,
  Settings as SettingsIcon,
  Wrench as WrenchIcon,
} from 'lucide-react-native'
import { useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import useTheme from '@/contexts/theme'
import useGlassColorScheme from '@/hooks/useGlassColorScheme'
import i18n, { TranslationKey } from '@/lib/locales'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import QuickActionSheet from '@/components/QuickActionSheet'
import QuickActionMenu from '@/components/QuickActionMenu'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'
import useAdaptiveLayout from '@/hooks/useAdaptiveLayout'

const CAPSULE_HEIGHT = 52
const HORIZONTAL_MARGIN = 12
const PILL_GAP = 8
const ACCESSORY_DIAMETER = CAPSULE_HEIGHT
const SIDEBAR_INSET = 12
const SIDEBAR_RADIUS = 28
const SIDEBAR_PADDING = 12
const SIDEBAR_CONTROL_RADIUS = SIDEBAR_RADIUS - SIDEBAR_PADDING

/**
 * Vertical space reserved above the safe-area bottom inset for the floating tab
 * bar — use in screens that need to pad content away from the bar.
 */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT

const liquidGlass = isLiquidGlassAvailable()

const TabBar = ({ state, descriptors, ...props }: BottomTabBarProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const quickActionFocusRef = useRef<View>(null)
  const rootNavigation = props.navigation as unknown as RootStackNavigation &
    HomeTabStackNavigation
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const glassColorScheme = useGlassColorScheme()
  const isDark = theme.colors.background === '#121212'
  const { hasSidebar, sidebarWidth } = useAdaptiveLayout()
  const overlaysMap = hasSidebar && state.routes[state.index].name === 'Map'

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const { options } = descriptors[route.key]
    const label = route.name
    const labelKey =
      label === 'Settings' ? 'settings' : (label as TranslationKey)
    const isFocused = state.index === index
    const isSettings = label === 'Settings'

    const onPress = () => {
      const event = props.navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      })
      if (!isFocused && !event.defaultPrevented) {
        props.navigation.navigate(route.name, route.params)
      }
    }

    const onLongPress = () => {
      props.navigation.emit({
        type: 'tabLongPress',
        target: route.key,
      })
    }

    const icon = (() => {
      switch (label) {
        case 'Home':
          return HouseIcon
        case 'Contacts':
          return BookUserIcon
        case 'Map':
          return MapPinnedIcon
        case 'Tools':
          return WrenchIcon
        case 'Progress':
          return ChartLineIcon
        case 'Schedule':
          return CalendarDaysIcon
        case 'Settings':
          return SettingsIcon
        default:
          return CircleQuestionMarkIcon
      }
    })()

    const color =
      isFocused && !isSettings ? theme.colors.text : theme.colors.textAlt

    return (
      <Pressable
        key={route.key}
        accessibilityRole='button'
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={
          options.tabBarAccessibilityLabel ?? i18n.t(labelKey)
        }
        onPress={onPress}
        onLongPress={onLongPress}
        hitSlop={hasSidebar ? 0 : { top: 20, bottom: 20, left: 4, right: 4 }}
        style={({ pressed }) => ({
          flex: hasSidebar ? undefined : 1,
          flexDirection: hasSidebar ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: hasSidebar ? 'flex-start' : 'center',
          gap: hasSidebar ? 12 : 2,
          paddingHorizontal: hasSidebar ? 14 : 2,
          paddingVertical: hasSidebar ? 14 : 0,
          minHeight: hasSidebar ? 50 : undefined,
          borderRadius: hasSidebar
            ? SIDEBAR_CONTROL_RADIUS
            : theme.numbers.borderRadiusMd,
          borderCurve: 'continuous',
          backgroundColor:
            hasSidebar && isFocused && !isSettings
              ? theme.colors.accentTranslucent
              : 'transparent',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <IconButton
          iconStyle={{
            color: hasSidebar && !isSettings ? theme.colors.accent : color,
          }}
          icon={icon}
          size={hasSidebar ? 22 : 18}
        />
        {(hasSidebar || isFocused) && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              color,
              flexShrink: 1,
              fontSize: theme.fontSize(hasSidebar ? 'md' : 'xs'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t(labelKey)}
          </Text>
        )}
      </Pressable>
    )
  }

  const pillShape = {
    flex: 1,
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
  }

  const tabsRow = (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
      }}
    >
      {state.routes.map(renderTab)}
    </View>
  )

  const mainPill = liquidGlass ? (
    <GlassView
      key='main'
      glassEffectStyle='regular'
      colorScheme={glassColorScheme}
      style={pillShape}
    >
      {tabsRow}
    </GlassView>
  ) : (
    <View
      key='main'
      style={[pillShape, { backgroundColor: theme.colors.card + 'cc' }]}
    >
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={60}
        style={StyleSheet.absoluteFill}
      />
      {tabsRow}
    </View>
  )

  const accessoryShape = {
    width: ACCESSORY_DIAMETER,
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
  }

  const plusButton = (
    <Button
      noTransform
      onPress={() => setSheetOpen(true)}
      hitSlop={{ top: 20, bottom: 20, left: 12, right: 12 }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
    >
      <IconButton icon={PlusIcon} color={theme.colors.textInverse} size={22} />
    </Button>
  )

  const accessoryPill = liquidGlass ? (
    <GlassView
      key='accessory'
      glassEffectStyle='regular'
      tintColor={theme.colors.accent}
      colorScheme={glassColorScheme}
      isInteractive
      style={accessoryShape}
    >
      {plusButton}
    </GlassView>
  ) : (
    <View
      key='accessory'
      style={[accessoryShape, { backgroundColor: theme.colors.accent }]}
    >
      {plusButton}
    </View>
  )

  if (hasSidebar) {
    return (
      <View
        pointerEvents='box-none'
        style={{
          width: sidebarWidth,
          position: overlaysMap ? 'absolute' : 'relative',
          top: overlaysMap ? 0 : undefined,
          bottom: overlaysMap ? 0 : undefined,
          left: overlaysMap ? 0 : undefined,
          zIndex: overlaysMap ? 1 : undefined,
          flexGrow: 0,
          flexShrink: 0,
          paddingTop: insets.top + SIDEBAR_INSET,
          paddingBottom: insets.bottom + SIDEBAR_INSET,
          paddingHorizontal: SIDEBAR_INSET,
          backgroundColor: overlaysMap
            ? 'transparent'
            : theme.colors.background,
        }}
      >
        <View
          style={{
            flex: 1,
            borderRadius: SIDEBAR_RADIUS,
            borderCurve: 'continuous',
            overflow: 'hidden',
            backgroundColor: liquidGlass
              ? 'transparent'
              : theme.colors.backgroundLighter,
          }}
        >
          {/* One regular glass surface holds the navigation hierarchy. UIKit
              adapts its material to contrast and transparency preferences. */}
          {liquidGlass && (
            <GlassView
              pointerEvents='none'
              glassEffectStyle='regular'
              colorScheme={glassColorScheme}
              style={[
                StyleSheet.absoluteFill,
                { borderRadius: SIDEBAR_RADIUS, borderCurve: 'continuous' },
              ]}
            />
          )}
          <ScrollView
            style={{ flex: 1 }}
            contentInsetAdjustmentBehavior='never'
            contentContainerStyle={{
              flexGrow: 1,
              // Safe areas belong to the floating panel's outer frame.
              paddingTop: SIDEBAR_PADDING,
              paddingBottom: SIDEBAR_PADDING,
              paddingHorizontal: SIDEBAR_PADDING,
              gap: 24,
            }}
          >
            <Text
              style={{
                paddingHorizontal: 14,
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              WitnessWork
            </Text>
            <View style={{ gap: 6 }}>
              {state.routes.map((route, index) =>
                route.name !== 'Settings' ? renderTab(route, index) : null
              )}
            </View>
            <View style={{ marginTop: 'auto', gap: 12 }}>
              {state.routes.map((route, index) =>
                route.name === 'Settings' ? renderTab(route, index) : null
              )}
              <AnchoredPopover
                contentWidth={320}
                accessibilityFocusRef={quickActionFocusRef}
                contentStyle={{ gap: 12 }}
                resolvePosition={({
                  anchor,
                  windowWidth,
                  windowHeight,
                  contentWidth,
                }) => ({
                  left: Math.min(
                    anchor.x + anchor.width + 12,
                    windowWidth - contentWidth - 12
                  ),
                  bottom: Math.max(
                    insets.bottom + 12,
                    windowHeight - anchor.y - anchor.height
                  ),
                  maxHeight: Math.max(
                    100,
                    Math.min(
                      anchor.y + anchor.height,
                      windowHeight - insets.bottom - 12
                    ) -
                      insets.top -
                      12
                  ),
                })}
                renderTrigger={({ onPress, anchorRef, expanded }) => (
                  <View ref={anchorRef} collapsable={false}>
                    <Button
                      noTransform
                      onPress={onPress}
                      accessibilityLabel={i18n.t('quickAction')}
                      accessibilityState={{ expanded }}
                      style={{
                        minHeight: 48,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        borderRadius: SIDEBAR_CONTROL_RADIUS,
                        borderCurve: 'continuous',
                        backgroundColor: theme.colors.accent,
                      }}
                    >
                      <IconButton
                        icon={PlusIcon}
                        color={theme.colors.textInverse}
                        size={20}
                      />
                      <Text
                        style={{
                          color: theme.colors.textInverse,
                          fontFamily: theme.fonts.semiBold,
                        }}
                      >
                        {i18n.t('add')}
                      </Text>
                    </Button>
                  </View>
                )}
              >
                {({ close }) => (
                  <>
                    <View
                      ref={quickActionFocusRef}
                      accessible
                      accessibilityRole='header'
                    >
                      <Text
                        style={{
                          fontFamily: theme.fonts.semiBold,
                          fontSize: theme.fontSize('lg'),
                        }}
                      >
                        {i18n.t('quickAction')}
                      </Text>
                    </View>
                    <QuickActionMenu
                      navigation={rootNavigation}
                      onAction={close}
                    />
                  </>
                )}
              </AnchoredPopover>
            </View>
          </ScrollView>
        </View>
      </View>
    )
  }

  return (
    <>
      <View
        pointerEvents='box-none'
        style={{
          position: 'absolute',
          left: HORIZONTAL_MARGIN,
          right: HORIZONTAL_MARGIN,
          bottom: insets.bottom,
          height: CAPSULE_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: PILL_GAP,
        }}
      >
        {mainPill}
        {accessoryPill}
      </View>
      <QuickActionSheet
        navigation={
          props.navigation as unknown as RootStackNavigation &
            HomeTabStackNavigation
        }
        setSheetOpen={setSheetOpen}
        sheetOpen={sheetOpen}
      />
    </>
  )
}

export default TabBar
