import { View } from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import useTheme from '../contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import IconButton from './IconButton'
import {
  faCalendarDays,
  faHome,
  faListUl,
  faMapLocation,
  faPlus,
  faQuestion,
  faWrench,
} from '@fortawesome/free-solid-svg-icons'
import Text from './MyText'
import i18n, { TranslationKey } from '../lib/locales'
import React, { useState } from 'react'
import Button from './Button'
import QuickActionSheet from './QuickActionSheet'
import { RootStackNavigation } from '../stacks/RootStack'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'

export const TAB_BAR_HEIGHT = 55

const TabBar = ({ state, descriptors, ...props }: BottomTabBarProps) => {
  const [sheetOpen, setSheetOpen] = useState(false)
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.backgroundLightest,
        paddingBottom: insets.bottom,
        shadowColor: theme.colors.shadow,
        justifyContent: 'space-evenly',
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: '100%',
        height: TAB_BAR_HEIGHT,
      }}
    >
      {state.routes.map((route, index) => {
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
            case 'Month':
              return faCalendarDays
            case 'Year':
              return faListUl
            default:
              return faQuestion
          }
        })()

        const color = isFocused ? theme.colors.text : theme.colors.textAlt

        return (
          <React.Fragment key={index}>
            {Math.ceil(state.routes.length / 2) === index && (
              <View
                style={{
                  paddingVertical: 5,
                  justifyContent: 'center',
                }}
              >
                <Button
                  style={{
                    backgroundColor: theme.colors.accent,
                    borderRadius: theme.numbers.borderRadiusSm,
                    paddingHorizontal: 10,
                    paddingVertical: 10,
                  }}
                  onPress={() => setSheetOpen(true)}
                >
                  <IconButton
                    icon={faPlus}
                    color={theme.colors.backgroundLightest}
                    size='xl'
                  />
                </Button>
              </View>
            )}
            <TouchableOpacity
              accessibilityRole='button'
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 5 }}
            >
              <IconButton
                style={{ paddingHorizontal: 30 }}
                iconStyle={{
                  color,
                }}
                icon={icon}
                size={18}
              />
              <Text style={{ color, fontSize: theme.fontSize('sm') }}>
                {i18n.t(label as TranslationKey)}
              </Text>
            </TouchableOpacity>
          </React.Fragment>
        )
      })}
      <QuickActionSheet
        navigation={
          props.navigation as unknown as RootStackNavigation &
            HomeTabStackNavigation
        }
        setSheetOpen={setSheetOpen}
        sheetOpen={sheetOpen}
      />
    </View>
  )
}
export default TabBar
