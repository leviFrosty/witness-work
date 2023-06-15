import * as eva from '@eva-design/eva';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import {
  ApplicationProvider,
  BottomNavigation,
  BottomNavigationTab,
  Icon,
  IconRegistry,
} from '@ui-kitten/components';
import { getLocales } from 'expo-localization';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { ImageProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Sentry from 'sentry-expo';

import { ThemeContext } from './src/contexts/ThemeContext';
import { MaterialCommunityIconsPack } from './src/lib/MaterialIconsPack';
import { i18n } from './src/lib/translations';
import HomeStackScreen from './src/stacks/HomeStackScreen';
import { RootStackParamList } from './src/stacks/ParamLists';
import TerritoryStackScreen from './src/stacks/TerritoryStackScreen';
import useSettingStore from './src/stores/SettingsStore';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Error tracking application setup
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  debug: true,
});

// Sets default language based on system language
i18n.locale = getLocales()[0].languageCode;

// When a value is missing from a language it'll fall back to another language with the key present.
i18n.enableFallback = true;

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  };

  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  const Tab = createBottomTabNavigator<RootStackParamList>();

  useEffect(() => {
    onLayoutRootView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { language: userPreferenceLanguage } = useSettingStore();

  useEffect(() => {
    if (userPreferenceLanguage) {
      i18n.locale = userPreferenceLanguage;
    }
  }, [userPreferenceLanguage]);

  const HomeIcon = (
    props?: Partial<ImageProps>,
  ): React.ReactElement<ImageProps> => <Icon {...props} name="home" />;

  const MapIcon = (
    props?: Partial<ImageProps>,
  ): React.ReactElement<ImageProps> => <Icon {...props} name="map" />;

  const BottomBar = ({ navigation, state }: BottomTabBarProps) => {
    return (
      <BottomNavigation
        appearance="noIndicator"
        style={{ paddingBottom: 40 }}
        selectedIndex={state.index}
        onSelect={index => navigation.navigate(state.routeNames[index])}>
        <BottomNavigationTab title={i18n.t('home')} icon={HomeIcon} />
        <BottomNavigationTab title={i18n.t('territory')} icon={MapIcon} />
      </BottomNavigation>
    );
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <IconRegistry icons={MaterialCommunityIconsPack} />
      <ApplicationProvider {...eva} theme={eva[theme]}>
        <SafeAreaProvider>
          <NavigationContainer
            theme={theme === 'dark' ? DarkTheme : DefaultTheme}>
            <Tab.Navigator
              initialRouteName="Home"
              tabBar={props => <BottomBar {...props} />}
              screenOptions={{
                headerShown: false,
              }}>
              <Tab.Screen name="Home" component={HomeStackScreen} />
              <Tab.Screen name="Territory" component={TerritoryStackScreen} />
            </Tab.Navigator>
          </NavigationContainer>
        </SafeAreaProvider>
      </ApplicationProvider>
    </ThemeContext.Provider>
  );
}

export default Sentry.Native.wrap(App);
