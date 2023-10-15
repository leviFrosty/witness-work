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
  nameInput: React.RefObject<TextInput>;
  phoneInput: React.RefObject<TextInput>;
  setName: React.Dispatch<React.SetStateAction<string>>;
  emailInput: React.RefObject<TextInput>;
  setPhone: React.Dispatch<React.SetStateAction<string>>;
  line1Input: React.RefObject<TextInput>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
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
        }}
      />
    </Section>
  );
};

const AddressSection = ({
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
  submit,
  setCountry,
}: {
  line1Input: React.RefObject<TextInput>;
  line2Input: React.RefObject<TextInput>;
  setLine1: React.Dispatch<React.SetStateAction<string>>;
  cityInput: React.RefObject<TextInput>;
  setLine2: React.Dispatch<React.SetStateAction<string>>;
  setCity: React.Dispatch<React.SetStateAction<string>>;
  stateInput: React.RefObject<TextInput>;
  setState: React.Dispatch<React.SetStateAction<string>>;
  zipInput: React.RefObject<TextInput>;
  countryInput: React.RefObject<TextInput>;
  setZip: React.Dispatch<React.SetStateAction<string>>;
  setCountry: React.Dispatch<React.SetStateAction<string>>;
  submit: () => void;
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
        }}
      />
      <TextInputRow
        label="Address Line 2"
        placeholder=""
        textInputProps={{
          ref: line2Input,
          onSubmitEditing: () => cityInput.current?.focus(),
          onChangeText: (val: string) => setLine2(val),
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
              onChangeText: (val: string) => setCity(val),
              ref: cityInput,
              onSubmitEditing: () => stateInput.current?.focus(),
            }}
          />
        </View>
        <View style={{ width: "50%" }}>
          <TextInputRow
            label="State"
            placeholder=""
            textInputProps={{
              onChangeText: (val: string) => setState(val),
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
          <TextInputRow
            label="ZIP"
            placeholder=""
            lastInSection
            textInputProps={{
              ref: zipInput,
              onSubmitEditing: () => countryInput.current?.focus(),
              onChangeText: (val: string) => setZip(val),

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
              returnKeyType: "done",
              ref: countryInput,
              onChangeText: (val: string) => setCountry(val),
              onSubmitEditing: submit,
            }}
          />
        </View>
      </View>
    </Section>
  );
};

type Props = NativeStackScreenProps<RootStackParamList, "Contact Form">;

const ContactForm = ({ route, navigation }: Props) => {
  const { addContact } = useContacts();
  const [errors, setErrors] = useState<Errors>({
    name: "",
  });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isBibleStudy, setIsBibleStudy] = useState(false);
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
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
    if (!name) {
      nameInput.current?.focus();
      setErrors({ name: "A name is required." });
      return false;
    }
    if (name) {
      setErrors({ name: "" });
    }
    return true;
  }, [name]);

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      const passValidation = validate();
      if (!passValidation) {
        return resolve(false);
      }
      const newContact: Contact = {
        id: route.params.id,
        name,
        phone,
        email,
        isBibleStudy,
        address: {
          line1,
          line2,
          city,
          state,
          zip,
          country,
        },
      };
      addContact(newContact);
      resolve(newContact);
    });
  }, [
    addContact,
    city,
    country,
    email,
    isBibleStudy,
    line1,
    line2,
    name,
    phone,
    route.params.id,
    state,
    validate,
    zip,
  ]);

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
                Continue
              </MyText>
            </Pressable>
          }
        />
      ),
    });
  }, [navigation, submit, validate]);

  const IsBibleStudyCheckbox = () => {
    return (
      <Pressable
        style={{ flexDirection: "row", gap: 10, marginLeft: 20 }}
        onPress={() => setIsBibleStudy(!isBibleStudy)}
      >
        <Checkbox
          value={isBibleStudy}
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
            Add Contact
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            Enter the contact information below for the person you will be
            adding to JW Time.
          </MyText>
        </View>
        <PersonalContactSection
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
          submit={submit}
          zipInput={zipInput}
        />
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ContactForm;
