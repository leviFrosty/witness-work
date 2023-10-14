import React, { PropsWithChildren, useRef } from "react";
import {
  TextInput,
  View,
  TextInputBase,
  TextInputComponent,
  NativeMethods,
} from "react-native";
import MyText from "./MyText";
import { RootStackParamList } from "../stacks/RootStack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import useContacts from "../stores/contactsStore";
import theme from "../constants/theme";
import Divider from "./Divider";
import { TimerMixin } from "react-native/types/private/TimerMixin";
import { Contact } from "../types/contact";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

type Props = NativeStackScreenProps<RootStackParamList, "Contact Form">;

const ContactForm = ({ navigation, route }: Props) => {
  const phoneInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const line1Input = useRef<TextInput>(null);
  const line2Input = useRef<TextInput>(null);
  const cityInput = useRef<TextInput>(null);
  const stateInput = useRef<TextInput>(null);
  const zipInput = useRef<TextInput>(null);
  const countryInput = useRef<TextInput>(null);
  const isStudyInput = useRef<TextInput>(null);

  const {
    contacts,
    deletedContacts,
    addContact,
    updateContact,
    deleteContact,
    _WARNING_clearDeleted,
    _WARNING_forceDeleteContacts,
  } = useContacts();

  const rowPaddingVertical = 15;

  const submit = () => {
    // addContact(contact)
  };

  const Section: React.FC<PropsWithChildren> = ({ children }) => {
    return (
      <View
        style={{
          borderColor: theme.colors.border,
          borderTopWidth: 2,
          borderBottomWidth: 2,
          backgroundColor: theme.colors.backgroundLighter,
          paddingVertical: rowPaddingVertical,
          paddingLeft: 25,
          gap: 10,
        }}
      >
        {children}
      </View>
    );
  };

  const InputRow = ({
    label,
    placeholder,
    lastInSection,
    noHorizontalPadding,
    textInputProps,
  }: {
    label: string;
    placeholder: string;
    lastInSection?: boolean;
    noHorizontalPadding?: boolean;
    textInputProps?: any;
  }) => {
    return (
      <View
        style={{
          flexDirection: "row",
          borderColor: theme.colors.border,
          borderBottomWidth: lastInSection ? 0 : 1,
          paddingBottom: lastInSection ? 0 : rowPaddingVertical,
          paddingRight: noHorizontalPadding ? 0 : 20,
          alignItems: "center",
          flexGrow: 1,
        }}
      >
        <MyText style={{ fontWeight: "600" }}>{label}</MyText>
        <TextInput
          hitSlop={{ top: 20, bottom: 20 }}
          style={{ flexGrow: 1, paddingLeft: 15 }}
          placeholder={placeholder}
          textAlign="right"
          returnKeyType="next"
          {...textInputProps}
        />
      </View>
    );
  };

  const PersonalContactSection = () => {
    return (
      <Section>
        <InputRow
          label="Name"
          placeholder="What's their name?"
          textInputProps={{
            autoFocus: true,
            onSubmitEditing: () => phoneInput.current?.focus(),
          }}
        />
        <InputRow
          label="Phone"
          placeholder="+x (xxx) xxx-xxxx"
          textInputProps={{
            ref: phoneInput,
            onSubmitEditing: () => emailInput.current?.focus(),
          }}
        />
        <InputRow
          label="Email"
          placeholder="example@acme.com"
          lastInSection
          textInputProps={{
            ref: emailInput,
            onSubmitEditing: () => line1Input.current?.focus(),
          }}
        />
      </Section>
    );
  };

  const AddressSection = () => {
    return (
      <Section>
        <InputRow
          label="Address Line 1"
          placeholder=""
          textInputProps={{
            ref: line1Input,
            onSubmitEditing: () => line2Input.current?.focus(),
          }}
        />
        <InputRow
          label="Address Line 2"
          placeholder=""
          textInputProps={{
            ref: line2Input,
            onSubmitEditing: () => cityInput.current?.focus(),
          }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ width: "50%" }}>
            <InputRow
              label="City"
              placeholder=""
              textInputProps={{
                ref: cityInput,
                onSubmitEditing: () => stateInput.current?.focus(),
              }}
            />
          </View>
          <View style={{ width: "50%" }}>
            <InputRow
              label="State"
              placeholder=""
              textInputProps={{
                ref: stateInput,
                onSubmitEditing: () => zipInput.current?.focus(),
              }}
            />
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <View style={{ width: "50%" }}>
            <InputRow
              label="ZIP"
              placeholder=""
              lastInSection
              textInputProps={{
                ref: zipInput,
                onSubmitEditing: () => countryInput.current?.focus(),
              }}
            />
          </View>
          <View style={{ width: "50%" }}>
            <InputRow
              label="Country"
              placeholder=""
              lastInSection
              textInputProps={{
                returnKeyType: "done",
                ref: countryInput,
                onSubmitEditing: submit,
              }}
            />
          </View>
        </View>
      </Section>
    );
  };

  return (
    <KeyboardAwareScrollView>
      <View style={{ gap: 30 }}>
        <View style={{ padding: 20, gap: 5 }}>
          <MyText style={{ fontSize: 32, fontWeight: "700" }}>
            Add Contact
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            Enter the contact information below for the person you will be
            adding to JW Time.
          </MyText>
        </View>
        <PersonalContactSection />
        <Divider borderStyle="dashed" />
        <AddressSection />
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ContactForm;

{
  /* <MyText
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
      <MyText onPress={_WARNING_clearDeleted}>Clear Deleted</MyText> */
}
