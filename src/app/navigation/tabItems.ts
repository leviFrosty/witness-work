import { type ImageSourcePropType, Platform } from 'react-native'
import type {
  NativeBottomTabIcon,
  NativeBottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs/unstable'
import i18n, { type TranslationKey } from '@/lib/locales'
import type { HomeTabStackParamList } from '@/types/homeStack'

type SFSymbol = Extract<NativeBottomTabIcon, { type: 'sfSymbol' }>['name']

type TabItem = {
  title: TranslationKey
  sfSymbol: SFSymbol
  sfSymbolSelected?: SFSymbol
  /** Android's native tab bar draws bitmaps (see `src/assets/tab-icons`). */
  android?: ImageSourcePropType
  androidSelected?: ImageSourcePropType
}

const items: Record<keyof HomeTabStackParamList, TabItem> = {
  Home: {
    title: 'Home',
    sfSymbol: 'house',
    sfSymbolSelected: 'house.fill',
    android: require('@/assets/tab-icons/home.png'),
    androidSelected: require('@/assets/tab-icons/home_selected.png'),
  },
  Contacts: {
    title: 'Contacts',
    sfSymbol: 'person.crop.rectangle.stack',
    sfSymbolSelected: 'person.crop.rectangle.stack.fill',
    android: require('@/assets/tab-icons/contacts.png'),
    androidSelected: require('@/assets/tab-icons/contacts_selected.png'),
  },
  Progress: {
    title: 'Progress',
    sfSymbol: 'chart.line.uptrend.xyaxis',
    android: require('@/assets/tab-icons/progress.png'),
  },
  Schedule: {
    title: 'Schedule',
    sfSymbol: 'calendar',
    android: require('@/assets/tab-icons/schedule.png'),
    androidSelected: require('@/assets/tab-icons/schedule_selected.png'),
  },
  // Only in the iPad sidebar.
  Settings: {
    title: 'settings',
    sfSymbol: 'gearshape',
    sfSymbolSelected: 'gearshape.fill',
  },
  QuickAction: {
    title: 'add',
    sfSymbol: 'plus',
    android: require('@/assets/tab-icons/add.png'),
  },
}

/** In `locale`, since native tab titles don't re-render on their own. */
export const tabTitle = (name: keyof HomeTabStackParamList, locale: string) =>
  i18n.t(items[name].title, { locale })

/** An SF Symbol on iOS and a Material Symbol on Android, filled when open. */
export function tabIcon(
  name: keyof HomeTabStackParamList
): NativeBottomTabNavigationOptions['tabBarIcon'] {
  const { sfSymbol, sfSymbolSelected, android, androidSelected } = items[name]
  if (Platform.OS === 'ios') {
    return ({ focused }) => ({
      type: 'sfSymbol',
      name: focused ? (sfSymbolSelected ?? sfSymbol) : sfSymbol,
    })
  }
  if (!android) return undefined
  return ({ focused }) => ({
    type: 'image',
    source: focused ? (androidSelected ?? android) : android,
  })
}
