import React, { useState } from "react";
import { View, TouchableOpacity } from "react-native";
import theme from "../constants/theme";
import { FontAwesome } from "@expo/vector-icons";
import Card from "./Card";
import MyText from "./MyText";
import ContactRow from "./ContactRow";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import * as Crypto from "expo-crypto";
import useContacts from "../stores/contactsStore";
import SearchBar from "./SearchBar";

const ContactsList = () => {
  const [search, setSearch] = useState("");
  const { contacts } = useContacts();
  const navigation = useNavigation<RootStackNavigation>();

  return (
    <View style={{ gap: 8 }}>
      <MyText style={{ fontSize: 12, fontWeight: "600", marginLeft: 5 }}>
        Contacts
      </MyText>
      <Card>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SearchBar value={search} setValue={setSearch} />
          <TouchableOpacity
            style={{
              paddingVertical: 15,
              paddingHorizontal: 25,
              backgroundColor: theme.colors.accent,
              borderRadius: theme.numbers.borderRadiusLg,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() =>
              navigation.navigate("Contact Form", { id: Crypto.randomUUID() })
            }
          >
            <FontAwesome
              style={{ fontSize: 15, color: theme.colors.textInverse }}
              name="plus"
            />
          </TouchableOpacity>
        </View>
        <View style={{ gap: 12 }}>
          {contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              onPress={() =>
                navigation.navigate("Contact Details", { id: contact.id })
              }
            />
          ))}
        </View>
      </Card>
    </View>
  );
};

export default ContactsList;
