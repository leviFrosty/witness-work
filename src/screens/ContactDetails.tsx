import { Pressable, TouchableOpacity, View } from "react-native";
import { useEffect } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import MyText from "../components/MyText";
import theme from "../constants/theme";
import { RootStackParamList } from "../stacks/RootStack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import useContacts from "../stores/contactsStore";
import Header from "../components/layout/Header";
import { FontAwesome } from "@expo/vector-icons";
import Card from "../components/Card";

type Props = NativeStackScreenProps<RootStackParamList, "Contact Details">;

const ContactDetails = ({ route, navigation }: Props) => {
  const { params } = route;
  const { contacts } = useContacts();
  const contact = contacts.find((c) => c.id === params.id);

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title=""
          buttonType="exit"
          rightElement={
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 20,
                position: "absolute",
                right: 0,
              }}
            >
              <TouchableOpacity
                hitSlop={15}
                onPress={async () => {
                  navigation.replace("Contact Form", {
                    id: params.id,
                    edit: true,
                  });
                }}
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                <FontAwesome
                  name="pencil"
                  style={{ fontSize: 16, color: theme.colors.textInverse }}
                />
                <MyText
                  style={{
                    color: theme.colors.textInverse,
                    textDecorationLine: "underline",
                    fontSize: 16,
                  }}
                >
                  Edit
                </MyText>
              </TouchableOpacity>
            </View>
          }
          backgroundColor={theme.colors.textAlt}
        />
      ),
    });
  }, [navigation, params.id]);

  if (!contact) {
    return (
      <MyText style={{ fontSize: 18 }}>
        Contact not found for provided ID: {params.id}
      </MyText>
    );
  }

  return (
    <KeyboardAwareScrollView
      automaticallyAdjustKeyboardInsets
      style={{ position: "relative" }}
    >
      <View style={{ gap: 30, padding: 20 }}>
        <View
          style={{
            paddingVertical: 100,
            gap: 5,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <MyText
            style={{
              fontSize: 32,
              fontWeight: "700",
              color: theme.colors.textInverse,
            }}
          >
            {contact.name}
          </MyText>
        </View>
        <Card>
          <MyText>Hello</MyText>
        </Card>
      </View>
      <View
        style={{
          position: "absolute",
          height: 500,
          width: "100%",
          zIndex: -100,
          backgroundColor: theme.colors.textAlt,
        }}
      />
    </KeyboardAwareScrollView>
  );
};

export default ContactDetails;
