import { useState } from 'react'
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  faChartLine,
  faHome,
  faMapLocation,
  faPlus,
  faQuestion,
  faWrench,
} from '@fortawesome/free-solid-svg-icons'

import useTheme from '../contexts/theme'
import i18n, { TranslationKey } from '../lib/locales'
import IconButton from './IconButton'
import Text from './MyText'
import Button from './Button'
import GlassPill from './GlassPill'
import QuickActionSheet from './QuickActionSheet'
import { RootStackNavigation } from '../types/rootStack'
import { HomeTabStackNavigation } from '../types/homeStack'

const CAPSULE_HEIGHT = 56
const FLOATING_GAP = 14
const HORIZONTAL_MARGIN = 16
const PILL_GAP = 10
const ACCESSORY_DIAMETER = CAPSULE_HEIGHT // square pill the width of its height = circle

/**
 * Vertical space reserved above the safe-area bottom inset for the floating tab
 * bar — use in screens that need to pad content away from the bar.
 */
export const TAB_BAR_HEIGHT = CAPSULE_HEIGHT + FLOATING_GAP

const TabBar = ({ state, descriptors, ...props }: BottomTabBarProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mainPillSize, setMainPillSize] = useState({ width: 0, height: 0 })
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
        case 'Map':
          return faMapLocation
        case 'Tools':
          return faWrench
        case 'Progress':
          return faChartLine
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
        accessibilityLabel={options.tabBarAccessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => ({
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          paddingHorizontal: 14,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <IconButton iconStyle={{ color }} icon={icon} size={18} />
        <Text
          style={{
            color,
            fontSize: theme.fontSize('xs'),
            fontFamily: isFocused ? theme.fonts.semiBold : theme.fonts.medium,
          }}
        >
          {i18n.t(label as TranslationKey)}
        </Text>
      </Pressable>
    )
  }

  const onMainLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    if (width !== mainPillSize.width || height !== mainPillSize.height) {
      setMainPillSize({ width, height })
    }
  }

  const mainPill = (
    <View
      key='main'
      onLayout={onMainLayout}
      style={{
        height: CAPSULE_HEIGHT,
        borderRadius: CAPSULE_HEIGHT / 2,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      {/* BlurView does the actual backdrop blur of content scrolling behind
          the tab bar — Skia can't reach outside its own surface to do this.
          Skia sits on top to add the glass *surface* treatment (tint,
          specular, rim) at reduced opacity so the blur shows through. */}
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={60}
        style={StyleSheet.absoluteFill}
      />
      {mainPillSize.width > 0 && (
        <GlassPill
          width={mainPillSize.width}
          height={mainPillSize.height}
          tint={theme.colors.card}
          rim={theme.colors.border}
          tintOpacity={0.4}
          isDark={isDark}
        />
      )}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 6,
        }}
      >
        {state.routes.map((route, index) => renderTab(route, index))}
      </View>
    </View>
  )

  const accessoryPill = (
    <View
      key='accessory'
      style={{
        width: ACCESSORY_DIAMETER,
        height: CAPSULE_HEIGHT,
        borderRadius: CAPSULE_HEIGHT / 2,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.accent,
        overflow: 'hidden',
      }}
    >
      <GlassPill
        width={ACCESSORY_DIAMETER}
        height={CAPSULE_HEIGHT}
        tint={theme.colors.accent}
        rim={'rgba(255,255,255,0.35)'}
        tintOpacity={0.95}
        isDark={isDark}
      />
      <Button
        noTransform
        onPress={() => setSheetOpen(true)}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'transparent',
        }}
      >
        <IconButton icon={faPlus} color={theme.colors.textInverse} size={22} />
      </Button>
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
          bottom: insets.bottom + FLOATING_GAP,
          height: CAPSULE_HEIGHT,
          flexDirection: 'row',
          justifyContent: 'space-between',
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
