import { Pressable, View, useColorScheme } from "react-native";
import { useMaterial3Theme } from "@pchmn/expo-material3-theme";
import * as SplashScreen from "expo-splash-screen";
import {
  Text,
  PaperProvider,
  Button,
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";
import { useCallback } from "react";
import {
  NavigationContainer,
  DefaultTheme as NavigationDefaultTheme,
  DarkTheme as NavigationDarkTheme,
  useNavigation
} from "@react-navigation/native";
import { NativeStackScreenProps, createNativeStackNavigator } from "@react-navigation/native-stack";

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);
  const colorScheme = useColorScheme();
  const { theme } = useMaterial3Theme();
  const paperTheme =
    colorScheme === "dark"
      ? { ...MD3DarkTheme, colors: theme.dark }
      : { ...MD3LightTheme, colors: theme.light };
  const { DarkTheme, LightTheme } = adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
  });

  const Stack = createNativeStackNavigator();

  type RootStackParamList = {
    Home: undefined;
    Details: undefined;
  };
  
  type HomeProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

  function HomeScreen({ navigation }: HomeProps) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Home Screen</Text>
        <Button mode="contained" onPress={() => navigation.navigate("Details")}>Details</Button>
        <Button mode="contained-tonal" onPress={() => navigation.navigate("Details")}>Details</Button>
        <Button mode="elevated"  onPress={() => navigation.navigate("Details")}>Details</Button>
        <Button mode="outlined"  onPress={() => navigation.navigate("Details")}>Details</Button>
        <Button mode="text" onPress={() => alert('You pressed button.')}>Alert</Button>
      </View>
    );
  }

  type DetailsProps = NativeStackScreenProps<RootStackParamList, 'Details'>;

  function DetailsScreen({ navigation }: DetailsProps) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Details Screen</Text>
        <Pressable style={{backgroundColor: "red", padding: 30,}} onPress={() => navigation.push("Details")}>
          <Text>
          Details
          </Text>
          </Pressable>
      </View>
    );
  }

  SplashScreen.hideAsync();

  return (
    <PaperProvider theme={paperTheme}>
      {/* <SafeAreaView onLayout={onLayoutRootView}> */}
      <NavigationContainer
        theme={colorScheme === "dark" ? DarkTheme : LightTheme}
      >
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={
              {
                // headerShown: false,
              }
            }
          />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      {/* </SafeAreaView> */}
    </PaperProvider>
  );
}
