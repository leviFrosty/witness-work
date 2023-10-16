import React, { useRef, useState, useCallback, useEffect } from "react";
import { TextInput, View, Pressable } from "react-native";
import MyText from "../components/MyText";
import { RootStackParamList } from "../stacks/RootStack";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import useContacts from "../stores/contactsStore";
import theme from "../constants/theme";
import Divider from "../components/Divider";
import { Contact } from "../types/contact";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Checkbox from "expo-checkbox";
import Section from "../components/inputs/Section";
import TextInputRow, { Errors } from "../components/inputs/InputRow";
import Header from "../components/layout/Header";

const PersonalContactSection = ({
  contact,
  nameInput,
  phoneInput,
  setName,
  emailInput,
  setPhone,
  line1Input,
  setEmail,
  setErrors,
  errors,
}: {
  contact: Contact;
  nameInput: React.RefObject<TextInput>;
  phoneInput: React.RefObject<TextInput>;
  setName: (name: string) => void;
  emailInput: React.RefObject<TextInput>;
  setPhone: (phone: string) => void;
  line1Input: React.RefObject<TextInput>;
  setEmail: (email: string) => void;
  errors: Errors;
  setErrors: React.Dispatch<React.SetStateAction<Errors>>;
}) => {
  return (
    <Section>
      <TextInputRow
        errors={errors}
        setErrors={setErrors}
        id="name"
        label="Name"
        placeholder="What's their name?"
        textInputProps={{
          ref: nameInput,
          onSubmitEditing: () => phoneInput.current?.focus(),
          onChangeText: (val: string) => setName(val),
          value: contact.name,
          autoCapitalize: "words",
          autoCorrect: false,
        }}
      />
      <TextInputRow
        label="Phone"
        placeholder="+x (xxx) xxx-xxxx"
        textInputProps={{
          ref: phoneInput,
          onSubmitEditing: () => emailInput.current?.focus(),
          onChangeText: (val: string) => setPhone(val),
          value: contact.phone,
        }}
      />
      <TextInputRow
        label="Email"
        placeholder="example@acme.com"
        lastInSection
        textInputProps={{
          ref: emailInput,
          onSubmitEditing: () => line1Input.current?.focus(),
          keyboardType: "email-address",
          onChangeText: (val: string) => setEmail(val),
          value: contact.email,
        }}
      />
    </Section>
  );
};

const AddressSection = ({
  contact,
  line1Input,
  line2Input,
  setLine1,
  cityInput,
  setLine2,
  setCity,
  stateInput,
  setState,
  zipInput,
  countryInput,
  setZip,
  setCountry,
}: {
  contact: Contact;
  line1Input: React.RefObject<TextInput>;
  line2Input: React.RefObject<TextInput>;
  setLine1: (line1: string) => void;
  cityInput: React.RefObject<TextInput>;
  setLine2: (line2: string) => void;
  setCity: (city: string) => void;
  stateInput: React.RefObject<TextInput>;
  setState: (state: string) => void;
  zipInput: React.RefObject<TextInput>;
  countryInput: React.RefObject<TextInput>;
  setZip: (zip: string) => void;
  setCountry: (country: string) => void;
}) => {
  return (
    <Section>
      <TextInputRow
        label="Address Line 1"
        placeholder=""
        textInputProps={{
          ref: line1Input,
          onSubmitEditing: () => line2Input.current?.focus(),
          onChangeText: (val: string) => setLine1(val),
          value: contact.address?.line1 || "",
        }}
      />
      <TextInputRow
        label="Address Line 2"
        placeholder=""
        textInputProps={{
          ref: line2Input,
          onSubmitEditing: () => cityInput.current?.focus(),
          onChangeText: (val: string) => setLine2(val),
          value: contact.address?.line2 || "",
        }}
      />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View style={{ width: "50%" }}>
          <TextInputRow
            label="City"
            placeholder=""
            textInputProps={{
              ref: cityInput,
              onSubmitEditing: () => stateInput.current?.focus(),
              onChangeText: (val: string) => setCity(val),
              value: contact.address?.city || "",
            }}
          />
        </View>
        <View style={{ width: "50%" }}>
          <TextInputRow
            label="State"
            placeholder=""
            textInputProps={{
              ref: stateInput,
              onSubmitEditing: () => zipInput.current?.focus(),
              onChangeText: (val: string) => setState(val),
              value: contact.address?.state || "",
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
          <TextInputRow
            label="ZIP"
            placeholder=""
            lastInSection
            textInputProps={{
              ref: zipInput,
              onSubmitEditing: () => countryInput.current?.focus(),
              onChangeText: (val: string) => setZip(val),
              value: contact.address?.zip || "",
              keyboardType: "number-pad",
            }}
          />
        </View>
        <View style={{ width: "50%" }}>
          <TextInputRow
            label="Country"
            placeholder=""
            lastInSection
            textInputProps={{
              ref: countryInput,
              onChangeText: (val: string) => setCountry(val),
              value: contact.address?.country || "",
            }}
          />
        </View>
      </View>
    </Section>
  );
};

type Props = NativeStackScreenProps<RootStackParamList, "Contact Form">;

const ContactForm = ({ route, navigation }: Props) => {
  const { addContact, contacts, updateContact } = useContacts();
  const editMode = route.params.edit;
  const [errors, setErrors] = useState<Errors>({
    name: "",
  });
  const contactToUpdate = editMode
    ? contacts.find((c) => c.id === route.params.id)
    : undefined;
  const [contact, setContact] = useState<Contact>(
    contactToUpdate || {
      id: route.params.id,
      createdAt: new Date(),
      name: "",
      address: {
        line1: "",
        line2: "",
        city: "",
        state: "",
        zip: "",
        country: "",
      },
      email: "",
      isBibleStudy: false,
      phone: "",
    }
  );

  const setName = (name: string) => {
    setContact({
      ...contact,
      name,
    });
  };
  const setPhone = (phone: string) => {
    setContact({
      ...contact,
      phone,
    });
  };
  const setEmail = (email: string) => {
    setContact({
      ...contact,
      email,
    });
  };
  const setIsBibleStudy = (isBibleStudy: boolean) => {
    setContact({
      ...contact,
      isBibleStudy,
    });
  };
  const setLine1 = (line1: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        line1,
      },
    });
  };
  const setLine2 = (line2: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        line2,
      },
    });
  };
  const setCity = (city: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        city,
      },
    });
  };
  const setState = (state: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        state,
      },
    });
  };
  const setZip = (zip: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        zip,
      },
    });
  };
  const setCountry = (country: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        country,
      },
    });
  };
  const nameInput = useRef<TextInput>(null);
  const phoneInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const line1Input = useRef<TextInput>(null);
  const line2Input = useRef<TextInput>(null);
  const cityInput = useRef<TextInput>(null);
  const stateInput = useRef<TextInput>(null);
  const zipInput = useRef<TextInput>(null);
  const countryInput = useRef<TextInput>(null);

  const validate = useCallback((): boolean => {
    if (!contact.name) {
      nameInput.current?.focus();
      setErrors({ name: "A name is required." });
      return false;
    }
    if (contact.name) {
      setErrors({ name: "" });
    }
    return true;
  }, [contact.name]);

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      const passValidation = validate();
      if (!passValidation) {
        return resolve(false);
      }
      if (editMode) {
        updateContact(contact);
      } else {
        addContact(contact);
      }
      resolve(contact);
    });
  }, [addContact, contact, editMode, updateContact, validate]);

  useEffect(() => {
    navigation.setOptions({
      header: ({ route: { params }, navigation }) => (
        <Header
          title=""
          buttonType="exit"
          rightElement={
            <Pressable
              style={{ position: "absolute", right: 0 }}
              hitSlop={15}
              onPress={async () => {
                const succeeded = await submit();
                if (!succeeded) {
                  // Failed validation if didn't submit
                  return;
                }
                if (editMode) {
                  navigation.replace("Contact Details", {
                    id: (params as { id: string }).id,
                  });
                  return;
                }

                navigation.replace("Conversation Form", {
                  id: (params as { id: string }).id,
                });
              }}
            >
              <MyText
                style={{
                  color: theme.colors.textInverse,
                  textDecorationLine: "underline",
                  fontSize: 16,
                }}
              >
                {editMode ? "Save" : "Continue"}
              </MyText>
            </Pressable>
          }
        />
      ),
    });
  }, [editMode, navigation, submit, validate]);

  const IsBibleStudyCheckbox = () => {
    return (
      <Pressable
        style={{ flexDirection: "row", gap: 10, marginLeft: 20 }}
        onPress={() => setIsBibleStudy(!contact.isBibleStudy)}
      >
        <Checkbox
          value={contact.isBibleStudy}
          onValueChange={(val) => setIsBibleStudy(val)}
        />
        <MyText>is Bible Study</MyText>
      </Pressable>
    );
  };

  return (
    <KeyboardAwareScrollView automaticallyAdjustKeyboardInsets>
      <View style={{ gap: 30 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <MyText style={{ fontSize: 32, fontWeight: "700" }}>
            {editMode ? "Edit" : "Add"} Contact
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            Enter the contact information below for the person you will be
            adding to JW Time.
          </MyText>
        </View>
        <PersonalContactSection
          contact={contact}
          emailInput={emailInput}
          line1Input={line1Input}
          nameInput={nameInput}
          phoneInput={phoneInput}
          setEmail={setEmail}
          setName={setName}
          setPhone={setPhone}
          errors={errors}
          setErrors={setErrors}
        />
        <IsBibleStudyCheckbox />
        <Divider borderStyle="dashed" />
        <AddressSection
          contact={contact}
          cityInput={cityInput}
          countryInput={countryInput}
          line1Input={line1Input}
          line2Input={line2Input}
          setCity={setCity}
          setLine1={setLine1}
          setLine2={setLine2}
          setState={setState}
          setZip={setZip}
          setCountry={setCountry}
          stateInput={stateInput}
          zipInput={zipInput}
        />
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ContactForm;
