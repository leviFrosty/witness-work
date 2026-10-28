import {
  BookUser as BookUserIcon,
  CalendarDays as CalendarDaysIcon,
  ChartLine as ChartLineIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
  House as HouseIcon,
  Plus as PlusIcon,
  Settings as SettingsIcon,
  Wrench as WrenchIcon,
} from 'lucide-react-native'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from '@/components/ui/BlurView'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

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
import SidebarToggle from '@/components/ui/SidebarToggle'
import SidebarResizeHandle from '@/components/ui/SidebarResizeHandle'
import PointerTooltip from '@/components/ui/PointerTooltip'
import { refreshCurrentLocation } from '@/lib/currentLocation'
import { useTabBarHidden } from '@/stores/tabBarVisibility'
import { BARS_TRANSITION_MS } from '@/components/ui/ScrollAwayHeader'
import { isRtlLayout } from '@/lib/direction'
import { NAVIGATION_RAIL_MIN_WIDTH } from '@/lib/sidebarLayout'

const CAPSULE_HEIGHT = 52
const RAIL_ITEM_SIZE = 48
const RAIL_PADDING = 4
const HORIZONTAL_MARGIN = 12
const PILL_GAP = 8
const ACCESSORY_MIN_WIDTH = 60
const SIDEBAR_INSET = 12
const SIDEBAR_RADIUS = 28
const SIDEBAR_PADDING = 12
const SIDEBAR_CONTROL_RADIUS = SIDEBAR_RADIUS - SIDEBAR_PADDING
/** Clears the bar's shadow too as it slides away. */
const HIDDEN_OVERSHOOT = 24
/**
 * The capsule keeps its height, so its small labels stop growing with large
 * text sizes here instead of spilling out of it.
 */
const CAPSULE_LABEL_FONT_SCALE_CAP = 1.3

/**
 * Vertical space reserved above the safe-area bottom inset for the floating tab
 * bar — use in screens that need to pad content away from the bar.
 */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT

const liquidGlass = isLiquidGlassAvailable()

type Props = BottomTabBarProps & {
  /** Only supplied while hardware Command is held and shortcuts are active. */
  shortcutHints?: Record<string, string>
  /**
   * A row above the "+" actions (Scribe AI's Speak an update), given the
   * function that closes the sheet or menu.
   */
  renderQuickActionLeading?: (close: () => void) => ReactNode
  /**
   * The account at the sidebar's foot, above Settings; `compact` while the
   * sidebar shows icons only.
   */
  renderSidebarAccount?: (compact: boolean) => ReactNode
}

const TabBar = ({
  state,
  descriptors,
  shortcutHints,
  renderQuickActionLeading,
  renderSidebarAccount,
  ...props
}: Props) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const quickActionFocusRef = useRef<View>(null)
  const rootNavigation = props.navigation as unknown as RootStackNavigation &
    HomeTabStackNavigation
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const glassColorScheme = useGlassColorScheme()
  const isDark = theme.colors.background === '#121212'
  const {
    hasSidebar,
    sidebarVisible,
    sidebarCompact,
    sidebarWidth,
    navigationRail,
  } = useAdaptiveLayout({ liveResize: true })
  const rail = navigationRail !== null
  // Like the system's vertical bar, the rail shows icons without titles.
  const iconOnly = sidebarCompact || rail
  // Toward the content. PointerTooltip mirrors `left` and `right` in RTL, and
  // the rail's side is physical.
  const railTooltipPlacement =
    (navigationRail === 'right') !== isRtlLayout()
      ? ('left' as const)
      : ('right' as const)
  // Scrolling down or exploring the map slides the floating bar away; the
  // sidebar always stays.
  const hidden = useTabBarHidden()
  const reduceMotion = useReducedMotion()
  // Drags write this on the UI thread; React only sets it from saved changes.
  const liveSidebarWidth = useSharedValue(sidebarWidth)
  const sidebarWidthStyle = useAnimatedStyle(() => ({
    width: liveSidebarWidth.value,
  }))

  useEffect(() => {
    if (sidebarWidth === 0) return
    // Animate accessibility steps; appear at full width when a sidebar first fits.
    liveSidebarWidth.value =
      liveSidebarWidth.value > 0
        ? withTiming(sidebarWidth, { duration: 200 })
        : sidebarWidth
  }, [liveSidebarWidth, sidebarWidth])

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const { options } = descriptors[route.key]
    const label = route.name
    const labelKey =
      label === 'Settings' ? 'settings' : (label as TranslationKey)
    const isFocused = state.index === index
    const isSettings = label === 'Settings'
    const shortcut = shortcutHints?.[route.key]

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

    const icon = (() => {
      switch (label) {
        case 'Home':
          return HouseIcon
        case 'Contacts':
          return BookUserIcon
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
      <PointerTooltip
        key={route.key}
        label={i18n.t(labelKey)}
        placement={railTooltipPlacement}
        // Labels are visible unless the sidebar is narrowed to icons; the rail
        // shows icons only, as the system's vertical bar does.
        enabled={(hasSidebar && sidebarCompact) || rail}
        style={{
          flex: hasSidebar || rail ? undefined : 1,
          borderRadius: rail
            ? RAIL_ITEM_SIZE / 2
            : hasSidebar
              ? SIDEBAR_CONTROL_RADIUS
              : theme.numbers.borderRadiusMd,
        }}
      >
        <Pressable
          accessibilityRole='button'
          accessibilityState={isFocused ? { selected: true } : {}}
          accessibilityLabel={
            options.tabBarAccessibilityLabel ?? i18n.t(labelKey)
          }
          onPress={onPress}
          hitSlop={
            hasSidebar || rail ? 0 : { top: 20, bottom: 20, left: 4, right: 4 }
          }
          style={({ pressed }) => ({
            flex: hasSidebar || rail ? undefined : 1,
            width: rail ? RAIL_ITEM_SIZE : undefined,
            height: rail ? RAIL_ITEM_SIZE : undefined,
            flexDirection: hasSidebar ? 'row' : 'column',
            alignItems: 'center',
            justifyContent:
              hasSidebar && !sidebarCompact ? 'flex-start' : 'center',
            gap: hasSidebar ? 12 : 2,
            paddingHorizontal: hasSidebar ? (sidebarCompact ? 0 : 14) : 2,
            paddingVertical: hasSidebar ? 14 : 0,
            minHeight: hasSidebar ? 50 : undefined,
            borderRadius: rail
              ? RAIL_ITEM_SIZE / 2
              : hasSidebar
                ? SIDEBAR_CONTROL_RADIUS
                : theme.numbers.borderRadiusMd,
            borderCurve: 'continuous',
            backgroundColor:
              (hasSidebar || rail) && isFocused && !isSettings
                ? theme.colors.accentTranslucent
                : 'transparent',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View>
            <IconButton
              iconStyle={{
                color:
                  (hasSidebar && !isSettings) || (rail && isFocused)
                    ? theme.colors.accent
                    : color,
              }}
              icon={icon}
              size={hasSidebar || rail ? 22 : 18}
            />
            {options.tabBarBadge !== undefined && (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -4,
                  width: 9,
                  height: 9,
                  borderRadius: 4.5,
                  backgroundColor: theme.colors.error,
                }}
              />
            )}
          </View>
          <View
            style={{
              flex: hasSidebar && !sidebarCompact ? 1 : undefined,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: iconOnly ? 'center' : undefined,
              position: iconOnly ? 'absolute' : undefined,
              bottom: iconOnly ? 1 : undefined,
              left: iconOnly ? 0 : undefined,
              right: iconOnly ? 0 : undefined,
              maxWidth: '100%',
              gap: 4,
            }}
          >
            {!sidebarCompact && !rail && (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={
                  hasSidebar ? undefined : CAPSULE_LABEL_FONT_SCALE_CAP
                }
                style={{
                  color,
                  flexShrink: 1,
                  flex: hasSidebar ? 1 : undefined,
                  fontSize: theme.fontSize(hasSidebar ? 'md' : 'xs'),
                  fontFamily: isFocused
                    ? theme.fonts.semiBold
                    : theme.fonts.regular,
                }}
              >
                {i18n.t(labelKey)}
              </Text>
            )}
            {shortcut && (
              <Text
                accessible={false}
                numberOfLines={1}
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: Platform.select({
                    ios: 'Menlo',
                    default: 'monospace',
                  }),
                  fontSize: theme.fontSize('xs') - 2,
                }}
              >
                {i18n.t('navigationShortcut', { number: shortcut })}
              </Text>
            )}
          </View>
        </Pressable>
      </PointerTooltip>
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
    minWidth: ACCESSORY_MIN_WIDTH,
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    borderCurve: 'continuous' as const,
    overflow: 'hidden' as const,
  }

  // An action, not a destination: it never shows a selected state.
  const plusButton = (
    <Button
      noTransform
      onPress={() => {
        setSheetOpen(true)
      }}
      accessibilityLabel={i18n.t('quickAction')}
      hitSlop={{ top: 20, bottom: 20, left: 12, right: 12 }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: 10,
        backgroundColor: 'transparent',
      }}
    >
      <IconButton icon={PlusIcon} color={theme.colors.textInverse} size={18} />
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={CAPSULE_LABEL_FONT_SCALE_CAP}
        style={{
          color: theme.colors.textInverse,
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {i18n.t('add')}
      </Text>
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

  if (hasSidebar && !sidebarVisible) return null

  // Each layout gets its own key. Otherwise React reuses the sidebar's view
  // for the floating bar, and Reanimated leaves the sidebar's animated width
  // on it, squeezing the bar into the corner after a window resize.
  if (hasSidebar) {
    return (
      <Animated.View
        key='sidebar'
        pointerEvents='box-none'
        style={[
          sidebarWidthStyle,
          {
            flexGrow: 0,
            flexShrink: 0,
            paddingTop: insets.top + SIDEBAR_INSET,
            paddingBottom: insets.bottom + SIDEBAR_INSET,
            paddingHorizontal: SIDEBAR_INSET,
            backgroundColor: theme.colors.background,
          },
        ]}
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
              paddingHorizontal: sidebarCompact ? 8 : SIDEBAR_PADDING,
              gap: 24,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: sidebarCompact ? 'center' : 'space-between',
                gap: 4,
              }}
            >
              {!sidebarCompact && (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                  style={{
                    flex: 1,
                    paddingLeft: 4,
                    fontFamily: theme.fonts.bold,
                    fontSize: theme.fontSize('lg'),
                  }}
                >
                  {i18n.t('witnessWork')}
                </Text>
              )}
              <SidebarToggle mode='hide' />
            </View>
            <View style={{ gap: 6 }}>
              {state.routes.map((route, index) =>
                route.name !== 'Settings' ? renderTab(route, index) : null
              )}
            </View>
            <View style={{ marginTop: 'auto', gap: 12 }}>
              <View style={{ gap: 6 }}>
                {renderSidebarAccount?.(sidebarCompact)}
                {state.routes.map((route, index) =>
                  route.name === 'Settings' ? renderTab(route, index) : null
                )}
              </View>
              <AnchoredPopover
                // Wide enough that Speak an update's title, badge and subtitle
                // each keep to one line at iPad text sizes.
                contentWidth={400}
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
                    <PointerTooltip
                      label={i18n.t('add')}
                      placement='right'
                      enabled={sidebarCompact}
                      effect='none'
                    >
                      <Button
                        noTransform
                        onPress={() => {
                          // Warms Log Visit's Nearby; never prompts.
                          if (!expanded) void refreshCurrentLocation()
                          onPress()
                        }}
                        accessibilityLabel={i18n.t('quickAction')}
                        accessibilityState={{ expanded }}
                        style={{
                          minHeight: 48,
                          padding: sidebarCompact ? 0 : 12,
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
                        {!sidebarCompact && (
                          <Text
                            style={{
                              color: theme.colors.textInverse,
                              fontFamily: theme.fonts.semiBold,
                            }}
                          >
                            {i18n.t('add')}
                          </Text>
                        )}
                      </Button>
                    </PointerTooltip>
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
                      leading={renderQuickActionLeading?.(close)}
                    />
                  </>
                )}
              </AnchoredPopover>
            </View>
          </ScrollView>
        </View>
        <SidebarResizeHandle
          width={sidebarWidth}
          liveWidth={liveSidebarWidth}
        />
      </Animated.View>
    )
  }

  if (navigationRail) {
    // The vertical status bar's safe area, which the system's own vertical
    // bar shares; screens keep clear of it (see HomeTabStack).
    const sideInset = navigationRail === 'right' ? insets.right : insets.left
    const railShape = {
      width: RAIL_ITEM_SIZE + RAIL_PADDING * 2,
      borderRadius: RAIL_ITEM_SIZE / 2 + RAIL_PADDING,
      borderCurve: 'continuous' as const,
      overflow: 'hidden' as const,
    }
    const railTabs = (
      <View style={{ padding: RAIL_PADDING, gap: 4 }}>
        {state.routes.map(renderTab)}
      </View>
    )

    return (
      <>
        <View
          style={{
            width: Math.max(sideInset, NAVIGATION_RAIL_MIN_WIDTH),
            alignItems: 'center',
            // Tab bars come after the toolbar's items, low on the side.
            justifyContent: 'flex-end',
            gap: 12,
            paddingTop: insets.top + 12,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.colors.background,
          }}
        >
          {liquidGlass ? (
            <GlassView
              glassEffectStyle='regular'
              colorScheme={glassColorScheme}
              style={railShape}
            >
              {railTabs}
            </GlassView>
          ) : (
            <View
              style={[railShape, { backgroundColor: theme.colors.card + 'cc' }]}
            >
              <BlurView
                tint={isDark ? 'dark' : 'light'}
                intensity={60}
                style={StyleSheet.absoluteFill}
              />
              {railTabs}
            </View>
          )}
          {/* Settings has no tab here, as on a phone; the rail keeps it in
          reach where the sidebar would. */}
          <PointerTooltip
            label={i18n.t('settings')}
            placement={railTooltipPlacement}
            effect='none'
          >
            <IconButton
              icon={SettingsIcon}
              size={22}
              color={theme.colors.textAlt}
              accessibilityLabel={i18n.t('settings')}
              hitSlop={0}
              style={{
                width: RAIL_ITEM_SIZE,
                height: RAIL_ITEM_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={() =>
                hasSidebar
                  ? rootNavigation.navigate('Settings')
                  : rootNavigation.navigate('SettingsMenu')
              }
              testID='rail-settings'
            />
          </PointerTooltip>
          <PointerTooltip
            label={i18n.t('add')}
            placement={railTooltipPlacement}
            effect='none'
          >
            <Button
              noTransform
              onPress={() => setSheetOpen(true)}
              accessibilityLabel={i18n.t('quickAction')}
              style={{
                width: RAIL_ITEM_SIZE + RAIL_PADDING * 2,
                height: RAIL_ITEM_SIZE + RAIL_PADDING * 2,
                borderRadius: RAIL_ITEM_SIZE / 2 + RAIL_PADDING,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.accent,
              }}
            >
              <IconButton
                icon={PlusIcon}
                color={theme.colors.textInverse}
                size={22}
              />
            </Button>
          </PointerTooltip>
        </View>
        <QuickActionSheet
          navigation={rootNavigation}
          setSheetOpen={setSheetOpen}
          sheetOpen={sheetOpen}
          leading={renderQuickActionLeading?.(() => setSheetOpen(false))}
        />
      </>
    )
  }

  return (
    <>
      <Animated.View
        key='bar'
        pointerEvents={hidden ? 'none' : 'box-none'}
        accessibilityElementsHidden={hidden}
        importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
        style={{
          position: 'absolute',
          left: HORIZONTAL_MARGIN,
          right: HORIZONTAL_MARGIN,
          bottom: insets.bottom,
          height: CAPSULE_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: PILL_GAP,
          transform: [
            {
              translateY: hidden
                ? CAPSULE_HEIGHT + insets.bottom + HIDDEN_OVERSHOOT
                : 0,
            },
          ],
          transitionProperty: 'transform',
          transitionDuration: reduceMotion ? 0 : BARS_TRANSITION_MS,
          transitionTimingFunction: 'ease-in-out',
        }}
      >
        {mainPill}
        {accessoryPill}
      </Animated.View>
      <QuickActionSheet
        navigation={
          props.navigation as unknown as RootStackNavigation &
            HomeTabStackNavigation
        }
        setSheetOpen={setSheetOpen}
        sheetOpen={sheetOpen}
        leading={renderQuickActionLeading?.(() => setSheetOpen(false))}
      />
    </>
  )
}

export default TabBar
