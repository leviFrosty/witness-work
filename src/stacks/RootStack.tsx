import {
  NativeStackNavigationProp,
  createNativeStackNavigator,
} from "@react-navigation/native-stack";
import ContactForm from "../components/ContactForm";
import Header from "../components/layout/Header";
import Home from "../screens/Home";
import MyText from "../components/MyText";
import theme from "../constants/theme";
import { Pressable } from "react-native";
import ConversationForm from "../components/ConversationForm";
import { Contact } from "../types/contact";

export type RootStackParamList = {
  Home: undefined;
  "Conversation Form": Pick<Contact, "id">;
  "Contact Details": Pick<Contact, "id">;
  "Contact Form": Pick<Contact, "id">;
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
      <RootStack.Group
        screenOptions={{
          header: ({ route: { name, params }, navigation }) => (
            <Header
              title=""
              buttonType="exit"
              rightElement={
                name === "Contact Form" && (
                  <Pressable
                    style={{ position: "absolute", right: 0 }}
                    hitSlop={15}
                    onPress={() =>
                      navigation.navigate("Call Details", {
                        id: (params as { id: string }).id,
                      })
                    }
                  >
                    <MyText
                      style={{
                        color: theme.colors.textInverse,
                        textDecorationLine: "underline",
                        fontSize: 16,
                      }}
                    >
                      Continue
                    </MyText>
                  </Pressable>
                )
              }
            />
          ),
        }}
      >
        <RootStack.Screen name="Contact Form" component={ContactForm} />
        <RootStack.Screen
          name="Conversation Form"
          component={ConversationForm}
        />
      </RootStack.Group>
    </RootStack.Navigator>
  );
};

export default RootStackComponent;
