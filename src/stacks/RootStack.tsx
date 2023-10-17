import {
  NativeStackNavigationProp,
  createNativeStackNavigator,
} from "@react-navigation/native-stack";
import ContactForm from "../screens/ContactForm";
import Header from "../components/layout/Header";
import Home from "../screens/Home";
import ConversationForm from "../screens/ConversationForm";
import ContactSelector from "../screens/ContactSelector";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "react-native";
import theme from "../constants/theme";
import ContactDetails from "../screens/ContactDetails";
import AddTime from "../screens/AddTime";

export type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  "Conversation Form": { id: string; referrer?: string }; // Contact ID
  "Contact Details": { id: string }; // Contact ID
  "Contact Form": { id: string; edit?: boolean }; // Contact ID
  "Contact Selector": undefined;
  "Add Time": undefined;
};

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>;
const RootStack = createNativeStackNavigator<RootStackParamList>();

const RootStackComponent = () => {
  const insets = useSafeAreaInsets();
  return (
    <RootStack.Navigator>
      <RootStack.Screen
        options={{
          header: () => <Header />,
        }}
        name="Home"
        component={Home}
      />
      <RootStack.Group>
        <RootStack.Screen
          options={{ presentation: "containedModal" }}
          name="Contact Details"
          component={ContactDetails}
        />
        <RootStack.Screen name="Contact Form" component={ContactForm} />
        <RootStack.Screen
          name="Conversation Form"
          component={ConversationForm}
        />
        <RootStack.Screen
          name="Contact Selector"
          component={ContactSelector}
          options={{
            presentation: "formSheet",
            header: () => (
              <View
                style={{
                  paddingTop: insets.top,
                  backgroundColor: theme.colors.accentBackground,
                }}
              />
            ),
          }}
        />
        <RootStack.Screen
          name="Add Time"
          options={{
            presentation: "modal",
            header: () => <Header buttonType="exit" />,
          }}
          component={AddTime}
        />
      </RootStack.Group>
    </RootStack.Navigator>
  );
};

export default RootStackComponent;
