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
import Section from "../components/inputs/Section";
import TextInputRow, { Errors } from "../components/inputs/TextInputRow";
import Header from "../components/layout/Header";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import i18n from "../lib/locales";

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
        label={i18n.t("name")}
        placeholder={i18n.t("name_placeholder")}
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
        label={i18n.t("phone")}
        placeholder={i18n.t("phone_placeholder")}
        textInputProps={{
          ref: phoneInput,
          onSubmitEditing: () => emailInput.current?.focus(),
          onChangeText: (val: string) => setPhone(val),
          value: contact.phone,
        }}
      />
      <TextInputRow
        label={i18n.t("email")}
        placeholder={i18n.t("email_placeholder")}
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
        label={i18n.t("addressLine1")}
        placeholder=""
        textInputProps={{
          ref: line1Input,
          onSubmitEditing: () => line2Input.current?.focus(),
          onChangeText: (val: string) => setLine1(val),
          autoCapitalize: "words",
          value: contact.address?.line1 || "",
        }}
      />
      <TextInputRow
        label={i18n.t("addressLine2")}
        placeholder=""
        textInputProps={{
          ref: line2Input,
          onSubmitEditing: () => cityInput.current?.focus(),
          onChangeText: (val: string) => setLine2(val),
          value: contact.address?.line2 || "",
          autoCapitalize: "words",
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
            label={i18n.t("city")}
            placeholder=""
            textInputProps={{
              ref: cityInput,
              onSubmitEditing: () => stateInput.current?.focus(),
              onChangeText: (val: string) => setCity(val),
              autoCapitalize: "words",
              value: contact.address?.city || "",
            }}
          />
        </View>
        <View style={{ width: "50%" }}>
          <TextInputRow
            label={i18n.t("state")}
            placeholder=""
            textInputProps={{
              ref: stateInput,
              onSubmitEditing: () => zipInput.current?.focus(),
              onChangeText: (val: string) => setState(val),
              value: contact.address?.state || "",
              autoCapitalize: "words",
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
            label={i18n.t("zip")}
            placeholder=""
            // lastInSection
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
            label={i18n.t("country")}
            placeholder=""
            // lastInSection
            textInputProps={{
              ref: countryInput,
              onChangeText: (val: string) => setCountry(val),
              value: contact.address?.country || "",
              autoCapitalize: "words",
            }}
          />
        </View>
      </View>
    </Section>
  );
};

type Props = NativeStackScreenProps<RootStackParamList, "Contact Form">;

const ContactForm = ({ route, navigation }: Props) => {
  const insets = useSafeAreaInsets();
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
      setErrors({ name: i18n.t("name_error") });
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
                {editMode ? i18n.t("save") : i18n.t("continue")}
              </MyText>
            </Pressable>
          }
        />
      ),
    });
  }, [editMode, navigation, submit, validate]);

  return (
    <KeyboardAwareScrollView
      extraHeight={100}
      automaticallyAdjustContentInsets
      automaticallyAdjustKeyboardInsets
    >
      <View style={{ gap: 30, paddingBottom: insets.bottom + 100 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <MyText style={{ fontSize: 32, fontWeight: "700" }}>
            {editMode ? i18n.t("edit") : i18n.t("add")} {i18n.t("contact")}
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {i18n.t("enterContactInformation")}
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
