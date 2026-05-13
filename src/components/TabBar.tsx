import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  faAddressBook,
  faCalendarDays,
  faChartLine,
  faHome,
  faMapLocation,
  faPlus,
  faQuestion,
  faWrench,
} from '@fortawesome/free-solid-svg-icons'

import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import IconButton from '@/components/IconButton'
import Text from '@/components/MyText'
import Button from '@/components/Button'
import QuickActionSheet from '@/components/QuickActionSheet'
import { RootStackNavigation } from '@/types/rootStack'
import { HomeTabStackNavigation } from '@/types/homeStack'

const CAPSULE_HEIGHT = 52
const HORIZONTAL_MARGIN = 12
const PILL_GAP = 8
const ACCESSORY_DIAMETER = CAPSULE_HEIGHT

/**
 * Vertical space reserved above the safe-area bottom inset for the floating tab
 * bar — use in screens that need to pad content away from the bar.
 */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT

const liquidGlass = isLiquidGlassAvailable()

const TabBar = ({ state, descriptors, ...props }: BottomTabBarProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const isDark = theme.colors.background === '#121212'

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const { options } = descriptors[route.key]
    const label = route.name
    const isFocused = state.index === index

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
          return faHome
        case 'Contacts':
          return faAddressBook
        case 'Map':
          return faMapLocation
        case 'Tools':
          return faWrench
        case 'Progress':
          return faChartLine
        case 'Schedule':
          return faCalendarDays
        default:
          return faQuestion
      }
    })()

    const color = isFocused ? theme.colors.text : theme.colors.textAlt

    return (
      <Pressable
        key={route.key}
        accessibilityRole='button'
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={
          options.tabBarAccessibilityLabel ?? i18n.t(label as TranslationKey)
        }
        onPress={onPress}
        onLongPress={onLongPress}
        hitSlop={{ top: 20, bottom: 20, left: 4, right: 4 }}
        style={({ pressed }) => ({
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          paddingHorizontal: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <IconButton iconStyle={{ color }} icon={icon} size={18} />
        {isFocused && (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={{
              color,
              fontSize: theme.fontSize('xs'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {i18n.t(label as TranslationKey)}
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
      {state.routes.map((route, index) => renderTab(route, index))}
    </View>
  )

  const mainPill = liquidGlass ? (
    <GlassView key='main' glassEffectStyle='regular' style={pillShape}>
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
      <IconButton icon={faPlus} color={theme.colors.textInverse} size={22} />
    </Button>
  )

  const accessoryPill = liquidGlass ? (
    <GlassView
      key='accessory'
      glassEffectStyle='regular'
      tintColor={theme.colors.accent}
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
