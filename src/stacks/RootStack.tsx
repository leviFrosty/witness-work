import {
  NativeStackNavigationProp,
  createNativeStackNavigator,
} from "@react-navigation/native-stack";
import ContactForm from "../components/ContactForm";
import Header from "../components/layout/Header";
import Home from "../screens/Home";

export type RootStackParamList = {
  Home: undefined;
  "Contact Form": undefined;
  "Contact Details": { id: string };
};

export type RootStackNavigation = NativeStackNavigationProp<RootStackParamList>;
const RootStack = createNativeStackNavigator<RootStackParamList>();

const RootStackComponent = () => {
  return (
    <RootStack.Navigator>
      <RootStack.Screen
        options={{
          header: () => <Header />,
        }}
        name="Home"
        component={Home}
      />
      <RootStack.Screen name="Contact Form" component={ContactForm} />
    </RootStack.Navigator>
  );
};

export default RootStackComponent;
