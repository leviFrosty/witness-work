import { View } from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import useTheme from '../contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import IconButton from './IconButton'
import {
  faHome,
  faMapLocation,
  faQuestion,
  faWrench,
} from '@fortawesome/free-solid-svg-icons'
import Text from './MyText'
import i18n, { TranslationKey } from '../lib/locales'

const TabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.backgroundLightest,
        paddingBottom: insets.bottom + 5,
        shadowColor: theme.colors.shadow,
        justifyContent: 'space-evenly',
        paddingTop: 10,
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
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params)
          }
        }

        const onLongPress = () => {
          navigation.emit({
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
            default:
              return faQuestion
          }
        })()

        const color = isFocused ? theme.colors.text : theme.colors.textAlt

        return (
          <TouchableOpacity
            key={index}
            accessibilityRole='button'
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={{ alignItems: 'center' }}
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
        )
      })}
    </View>
  )
}
export default TabBar
