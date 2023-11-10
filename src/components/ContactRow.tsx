import { View, TouchableOpacity } from "react-native";
import Text from "./MyText";
import useTheme from "../contexts/theme";
import Card from "./Card";
import { FontAwesome } from "@expo/vector-icons";
import { Contact } from "../types/contact";
import useConversations from "../stores/conversationStore";
import { useMemo } from "react";
import moment from "moment";
import i18n from "../lib/locales";
import {
  contactHasAtLeastOneStudy,
  contactStudiedForGivenMonth,
} from "../lib/conversations";

const ContactRow = ({
  contact,
  onPress,
}: {
  contact: Contact;
  onPress?: () => void;
}) => {
  const theme = useTheme();
  const { conversations } = useConversations();
  const { name } = contact;

  const isActiveBibleStudy = contactStudiedForGivenMonth({
    contact,
    conversations,
    month: new Date(),
  });

  const hasStudiedPreviously = contactHasAtLeastOneStudy({
    conversations,
    contact,
  });

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
          <Text style={{ fontSize: 18 }}>{name}</Text>
          <Text style={{ color: theme.colors.textAlt, fontSize: 10 }}>
            {mostRecentConversation
              ? moment(mostRecentConversation.date).fromNow()
              : i18n.t("noRecentConversation_plural")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {hasStudiedPreviously && (
            <FontAwesome
              style={{
                color: isActiveBibleStudy
                  ? theme.colors.text
                  : theme.colors.textAlt,
                fontSize: 15,
              }}
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
