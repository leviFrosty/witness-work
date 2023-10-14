import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import theme from "../constants/theme";
import { FontAwesome } from "@expo/vector-icons";
import Card from "./Card";
import MyText from "./MyText";
import ContactRow from "./ContactRow";

const ContactsList = () => {
  return (
    <View style={{ gap: 8 }}>
      <MyText style={{ fontSize: 12, fontWeight: "600", marginLeft: 5 }}>
        Contacts
      </MyText>
      <Card>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TextInput
            style={{
              height: 65,
              borderRadius: theme.numbers.borderRadiusLg,
              backgroundColor: theme.colors.backgroundLighter,
              paddingHorizontal: 15,
              borderColor: theme.colors.border,
              borderWidth: 1,
              flexGrow: 1,
            }}
            placeholder="Search for contact..."
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          <TouchableOpacity
            style={{
              paddingVertical: 15,
              paddingHorizontal: 25,
              backgroundColor: theme.colors.accent,
              borderRadius: theme.numbers.borderRadiusLg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FontAwesome
              style={{ fontSize: 15, color: theme.colors.textInverse }}
              name="plus"
            />
          </TouchableOpacity>
        </View>
        <View style={{ gap: 12 }}>
          {[...Array(12).keys()].map((val) => (
            <ContactRow key={val} />
          ))}
          <ContactRow />
        </View>
      </Card>
    </View>
  );
};

export default ContactsList;
