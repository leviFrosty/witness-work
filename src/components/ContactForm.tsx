import React from "react";
import { View } from "react-native";
import MyText from "./MyText";
import { RootStackParamList } from "../stacks/RootStack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import useContacts from "../stores/contactsStore";

type Props = NativeStackScreenProps<RootStackParamList, "Contact Form">;

const ContactForm = ({ navigation }: Props) => {
  const {
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    deleteContact,
    _WARNING_clearDeleted,
    _WARNING_forceDeleteContacts,
  } = useContacts();

  return (
    <View>
      <MyText onPress={() => navigation.goBack()}>Go back</MyText>
      <MyText>Contact Form</MyText>
      <MyText
        onPress={() => {
          addContact({ id: "2", name: "Bob" });
        }}
      >
        Add Contact
      </MyText>
      <MyText
        onPress={() => {
          updateContact({ id: "1", name: "George" });
        }}
      >
        Update Contact
      </MyText>
      <MyText>Contacts: {JSON.stringify(contacts, null, 2)}</MyText>
      <MyText onPress={() => deleteContact("2")}>Delete Contact</MyText>
      <MyText>
        Deleted contacts: {JSON.stringify(deletedContacts, null, 2)}
      </MyText>
      <MyText onPress={_WARNING_forceDeleteContacts}>
        Delete All Contacts
      </MyText>
      <MyText onPress={_WARNING_clearDeleted}>Clear Deleted</MyText>
    </View>
  );
};

export default ContactForm;
