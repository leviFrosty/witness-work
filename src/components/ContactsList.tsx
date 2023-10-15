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
import { FlashList } from "@shopify/flash-list";

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
        <View style={{ flex: 1, minHeight: 10 }}>
          <FlashList
            data={contacts}
            renderItem={({ item }) => (
              <ContactRow
                key={item.id}
                contact={item}
                onPress={() =>
                  navigation.navigate("Contact Details", { id: item.id })
                }
              />
            )}
            estimatedItemSize={84}
            ItemSeparatorComponent={() => (
              <View style={{ marginVertical: 6 }} />
            )}
          />
        </View>
      </Card>
    </View>
  );
};

export default ContactsList;
