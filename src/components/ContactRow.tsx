import { View, TouchableOpacity } from "react-native";
import MyText from "./MyText";
import theme from "../constants/theme";
import Card from "./Card";
import { FontAwesome } from "@expo/vector-icons";
import { Contact } from "../types/contact";
import useConversations from "../stores/conversationStore";
import { useMemo } from "react";
import moment from "moment";

const ContactRow = ({
  contact,
  onPress,
}: {
  contact: Contact;
  onPress?: () => void;
}) => {
  const { conversations } = useConversations();
  const { name, isBibleStudy } = contact;

  const mostRecentConversation = useMemo(() => {
    const filteredConversations = conversations.filter(
      (c) => c.contact.id === contact.id
    );
    const sortedConversations = filteredConversations.sort((a, b) =>
      moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
    );

    return sortedConversations.length > 0 ? sortedConversations[0] : null;
  }, [contact.id, conversations]);

  return (
    <TouchableOpacity onPress={onPress}>
      <Card
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          alignItems: "center",
        }}
        flexDirection="row"
      >
        <View style={{ flexGrow: 1, gap: 2 }}>
          <MyText style={{ fontSize: 18 }}>{name}</MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 10 }}>
            {mostRecentConversation
              ? moment(mostRecentConversation.date).fromNow()
              : `No recent conversations`}
          </MyText>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {isBibleStudy && (
            <FontAwesome
              style={{ color: theme.colors.text, fontSize: 15 }}
              name="book"
            />
          )}
          <FontAwesome
            style={{ color: theme.colors.textAlt, fontSize: 15 }}
            name="chevron-right"
          />
        </View>
      </Card>
    </TouchableOpacity>
  );
};

export default ContactRow;
