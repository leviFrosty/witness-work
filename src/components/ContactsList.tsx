import React, { useMemo, useState } from "react";
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
import moment from "moment";
import useConversations from "../stores/conversationStore";

const ContactsList = () => {
  const [search, setSearch] = useState("");
  const { conversations } = useConversations();
  const { contacts } = useContacts();
  const navigation = useNavigation<RootStackNavigation>();

  const searchResultsSorted = useMemo(
    () =>
      contacts
        .filter((c) => c.name.includes(search))
        .sort((a, b) => {
          const filteredConversationsA = conversations.filter(
            (c) => c.contact.id === a.id
          );
          const filteredConversationsB = conversations.filter(
            (c) => c.contact.id === b.id
          );

          const sortedConversationsA = filteredConversationsA.sort((a, b) =>
            moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
          );
          const sortedConversationsB = filteredConversationsB.sort((a, b) =>
            moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
          );

          const mostRecentConversationA =
            sortedConversationsA.length > 0 ? sortedConversationsA[0] : null;
          const mostRecentConversationB =
            sortedConversationsB.length > 0 ? sortedConversationsB[0] : null;

          if (mostRecentConversationA === null) {
            return 1;
          }
          if (mostRecentConversationB === null) {
            return -1;
          }

          return moment(mostRecentConversationA?.date).unix() <
            moment(mostRecentConversationB?.date).unix()
            ? 1
            : -1;
        }),
    [contacts, conversations, search]
  );

  return (
    <View style={{ gap: 8 }}>
      <MyText style={{ fontSize: 12, fontWeight: "600", marginLeft: 5 }}>
        Return Visit Contacts
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
            data={searchResultsSorted}
            renderItem={({ item }) => (
              <ContactRow
                key={item.id}
                contact={item}
                onPress={() =>
                  navigation.navigate("Contact Details", { id: item.id })
                }
              />
            )}
            ListEmptyComponent={() => (
              <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
                No contacts saved. Tap the plus button to add a contact.
              </MyText>
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
