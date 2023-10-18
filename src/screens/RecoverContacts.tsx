import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import MyText from "../components/MyText";
import theme from "../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useContacts from "../stores/contactsStore";
import { FontAwesome } from "@expo/vector-icons";
import moment from "moment";
import Card from "../components/Card";
import useConversations from "../stores/conversationStore";
import { FlashList } from "@shopify/flash-list";

const RecoverContacts = () => {
  const { conversations, deleteConversation } = useConversations();
  const { deletedContacts, recoverContact, removeDeletedContact } =
    useContacts();
  const insets = useSafeAreaInsets();

  const handleRemoveDeleted = (id: string) => {
    removeDeletedContact(id);
    const conversationsToDelete = conversations.filter(
      (convo) => convo.contact.id === id
    );
    conversationsToDelete.forEach((cToDelete) =>
      deleteConversation(cToDelete.id)
    );
  };

  const sortedContacts = deletedContacts.sort((a, b) =>
    moment(a.createdAt).unix() < moment(b.createdAt).unix() ? 1 : -1
  );

  return (
    <View
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: "space-between",
        marginBottom: insets.bottom + 30,
      }}
    >
      <View style={{ gap: 30, flexGrow: 1 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <MyText style={{ fontSize: 32, fontWeight: "700" }}>
            Recover Contacts
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            Press undo below to recover a contact. Deleting contacts from this
            page will permanently delete it as well as corresponding
            conversations.
          </MyText>
        </View>
        <ScrollView
          style={{ marginBottom: insets.bottom + 60 }}
          contentInset={{
            top: 0,
            right: 0,
            bottom: insets.bottom + 30,
            left: 0,
          }}
        >
          <View
            style={{
              gap: 20,
              paddingHorizontal: 10,
              marginBottom: insets.bottom,
            }}
          >
            {deletedContacts.length === 0 && (
              <MyText style={{ paddingHorizontal: 20 }}>
                Deleted contacts will appear here.
              </MyText>
            )}
            <View style={{ minHeight: 2 }}>
              <FlashList
                data={sortedContacts}
                estimatedItemSize={87}
                renderItem={({ item }) => (
                  <View style={{ padding: 6 }}>
                    <Card
                      key={item.id}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View style={{ gap: 5 }}>
                        <MyText
                          style={{
                            fontSize: 10,
                            fontWeight: "600",
                            color: theme.colors.textAlt,
                          }}
                        >
                          {`Created: ${moment(item.createdAt).format(
                            "MMM DD, YYYY"
                          )}`}
                        </MyText>
                        <View
                          style={{
                            flexDirection: "row",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => recoverContact(item.id)}
                          >
                            <FontAwesome
                              style={{
                                fontSize: 16,
                                color: theme.colors.textAlt,
                              }}
                              name="undo"
                            />
                          </TouchableOpacity>
                          <MyText>{item.name}</MyText>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={{ flexDirection: "row", gap: 40 }}
                        onPress={() =>
                          Alert.alert(
                            "Permanently Delete?",
                            "Deleting this contact will permanently remove it and corresponding conversations.",
                            [
                              {
                                text: "Cancel",
                                style: "cancel",
                              },
                              {
                                text: "Delete",
                                style: "destructive",
                                onPress: () => {
                                  handleRemoveDeleted(item.id);
                                },
                              },
                            ]
                          )
                        }
                      >
                        <FontAwesome
                          name="trash"
                          style={{ fontSize: 16, color: theme.colors.textAlt }}
                        />
                      </TouchableOpacity>
                    </Card>
                  </View>
                )}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

export default RecoverContacts;
