import { Pressable, View } from "react-native";
import MyText from "../components/MyText";
import * as Crypto from "expo-crypto";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../stacks/RootStack";
import useContacts from "../stores/contactsStore";
import { useEffect, useState } from "react";
import Header from "../components/layout/Header";
import theme from "../constants/theme";
import Divider from "../components/Divider";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Section from "../components/inputs/Section";
import { FontAwesome } from "@expo/vector-icons";
import { Conversation } from "../types/conversation";
import InputRowContainer from "../components/inputs/InputRowContainer";

type Props = NativeStackScreenProps<RootStackParamList, "Conversation Form">;

const ConversationForm = ({ route, navigation }: Props) => {
  const { params } = route;
  const { contacts } = useContacts();
  const [_selectedContactId, set_selectedContactId] = useState<string>();
  const assignedContactId = _selectedContactId ?? params.id;
  const [conversation, setConversation] = useState<Conversation>({
    id: Crypto.randomUUID(),
    contact: {
      id: assignedContactId,
    },
    date: new Date(),
  });
  const selectedContact = contacts.find((c) => c.id === assignedContactId);

  // const validate = useCallback((): boolean => {
  //   if (!name) {
  //     nameInput.current?.focus();
  //     setErrors({ name: "A name is required." });
  //     return false;
  //   }
  //   if (name) {
  //     setErrors({ name: "" });
  //   }
  //   return true;
  // }, [name]);

  // const submit = useCallback(() => {
  //   return new Promise((resolve) => {
  //     const passValidation = validate();
  //     if (!passValidation) {
  //       return resolve(false);
  //     }
  //     const newContact: Contact = {
  //       id: route.params.id,
  //       name,
  //       phone,
  //       email,
  //       isBibleStudy,
  //       address: {
  //         line1,
  //         line2,
  //         city,
  //         state,
  //         zip,
  //         country,
  //       },
  //     };
  //     addContact(newContact);
  //     resolve(newContact);
  //   });
  // }, [
  //   addContact,
  //   city,
  //   country,
  //   email,
  //   isBibleStudy,
  //   line1,
  //   line2,
  //   name,
  //   phone,
  //   route.params.id,
  //   state,
  //   validate,
  //   zip,
  // ]);

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
              <Pressable
                hitSlop={15}
                onPress={async () => {
                  // const succeeded = await submit();
                  // if (!succeeded) {
                  //   // Failed validation if didn't submit
                  //   return;
                  // }
                  navigation.popToTop();
                }}
              >
                <MyText
                  style={{
                    color: theme.colors.textInverse,
                    fontSize: 12,
                  }}
                >
                  Skip
                </MyText>
              </Pressable>
              <Pressable
                hitSlop={15}
                onPress={async () => {
                  // const succeeded = await submit();
                  // if (!succeeded) {
                  //   // Failed validation if didn't submit
                  //   return;
                  // }
                  navigation.popToTop();
                }}
              >
                <MyText
                  style={{
                    color: theme.colors.textInverse,
                    textDecorationLine: "underline",
                    fontSize: 16,
                  }}
                >
                  Save
                </MyText>
              </Pressable>
            </View>
          }
        />
      ),
    });
  }, [navigation]);

  return (
    <KeyboardAwareScrollView automaticallyAdjustKeyboardInsets>
      <View style={{ gap: 30 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <MyText style={{ fontSize: 32, fontWeight: "700" }}>
            Add Conversation
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            Enter the contact information below for the person you will be
            adding to JW Time.
          </MyText>
        </View>
        <MyText>Assigned Contact: {assignedContactId} </MyText>
        <Section>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 15,
              paddingRight: 20,
            }}
          >
            {selectedContact ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <FontAwesome name="id-badge" style={{ fontSize: 16 }} />
                <MyText style={{ fontWeight: "600", fontSize: 16 }}>
                  {selectedContact.name}
                </MyText>
              </View>
            ) : (
              <MyText>No contact assigned</MyText>
            )}
            <Pressable
              onPress={() =>
                selectedContact
                  ? set_selectedContactId("")
                  : navigation.navigate("Contact Selector")
              }
            >
              <MyText
                style={{
                  color: theme.colors.textAlt,
                  textDecorationLine: "underline",
                }}
              >
                {selectedContact ? "Unassign" : "Assign"}
              </MyText>
            </Pressable>
          </View>
        </Section>
        <Divider borderStyle="dashed" />
        <Section>
          <InputRowContainer label="Date"></InputRowContainer>
        </Section>
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ConversationForm;
