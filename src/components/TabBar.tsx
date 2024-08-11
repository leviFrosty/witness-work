import { View } from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import useTheme from '../contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import IconButton from './IconButton'
import {
  faCalendarDays,
  faClock,
  faHome,
  faListUl,
  faMapLocation,
  faPlus,
  faQuestion,
  faTimes,
  faWrench,
} from '@fortawesome/free-solid-svg-icons'
import Text from './MyText'
import i18n, { TranslationKey } from '../lib/locales'
import React, { useState } from 'react'
import Button from './Button'
import { Sheet, XStack } from 'tamagui'
import ActionButton from './ActionButton'
import { usePreferences } from '../stores/preferences'
import { RootStackNavigation } from '../stacks/RootStack'
import { HomeTabStackNavigation } from '../stacks/HomeTabStack'
import * as Crypto from 'expo-crypto'
import XView from './layout/XView'
import { faIdCard } from '@fortawesome/free-regular-svg-icons'

const TabBar = ({ state, descriptors, ...props }: BottomTabBarProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [sheetOpen, setSheetOpen] = useState(false)
  const { publisher } = usePreferences()

  const handleQuickAction = (action: 'addTime' | 'addContact') => {
    setSheetOpen(false)
    const navigation = props.navigation as unknown as RootStackNavigation &
      HomeTabStackNavigation
    switch (action) {
      case 'addTime':
        navigation.navigate('Add Time')
        break
      case 'addContact':
        navigation.navigate('Contact Form', { id: Crypto.randomUUID() })
        break
    }
  }

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
      <Sheet
        open={sheetOpen}
        modal
        snapPoints={[40]}
        onOpenChange={(o: boolean) => setSheetOpen(o)}
        dismissOnSnapToBottom
        animation='quick'
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <XStack ai='center' jc='space-between' px={20} pt={20} pb={10}>
            <Text
              style={{
                fontSize: theme.fontSize('2xl'),
                color: theme.colors.text,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('quickAction')}
            </Text>
            <IconButton
              onPress={() => setSheetOpen(false)}
              size={20}
              icon={faTimes}
              color={theme.colors.text}
            />
          </XStack>
          <Sheet.ScrollView contentContainerStyle={{ paddingTop: 10 }}>
            <View style={{ gap: 10, paddingHorizontal: 20 }}>
              {publisher !== 'publisher' && (
                <ActionButton onPress={() => handleQuickAction('addTime')}>
                  <XView style={{ gap: 10 }}>
                    <IconButton
                      icon={faClock}
                      color={theme.colors.textInverse}
                    />
                    <Text
                      style={{
                        fontFamily: theme.fonts.bold,
                        color: theme.colors.textInverse,
                        fontSize: theme.fontSize('lg'),
                      }}
                    >
                      {i18n.t('addTime')}
                    </Text>
                  </XView>
                </ActionButton>
              )}
              <ActionButton onPress={() => handleQuickAction('addContact')}>
                <XView style={{ gap: 10 }}>
                  <IconButton
                    icon={faIdCard}
                    color={theme.colors.textInverse}
                  />
                  <Text
                    style={{
                      fontFamily: theme.fonts.bold,
                      color: theme.colors.textInverse,
                      fontSize: theme.fontSize('lg'),
                    }}
                  >
                    {i18n.t('addContact')}
                  </Text>
                </XView>
              </ActionButton>
            </View>
          </Sheet.ScrollView>
        </Sheet.Frame>
      </Sheet>
    </View>
  )
}
export default TabBar
