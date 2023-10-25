import { Alert, TouchableOpacity, View } from "react-native";
import MyText from "./MyText";
import { Conversation } from "../types/conversation";
import moment from "moment";
import theme from "../constants/theme";
import { FontAwesome } from "@expo/vector-icons";
import Divider from "./Divider";
import useConversations from "../stores/conversationStore";
import i18n from "../lib/locales";

const ConversationRow = ({ conversation }: { conversation: Conversation }) => {
  const { deleteConversation } = useConversations();
  const notificationHasPassed =
    conversation.followUp &&
    moment(conversation.followUp.date).isSameOrAfter(moment());

  const hasNoConversationDetails = !conversation.note?.length;

  return (
    <View
      style={{
        gap: 10,
        backgroundColor: theme.colors.background,
        borderRadius: theme.numbers.borderRadiusLg,
        padding: 15,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <MyText
          style={{
            fontSize: 12,
            fontWeight: "600",
            color: theme.colors.textAlt,
          }}
        >
          {moment(conversation.date).format("MMM DD, YYYY")}
        </MyText>
        <TouchableOpacity
          hitSlop={15}
          onPress={() =>
            Alert.alert(
              i18n.t("deleteConversation"),
              i18n.t("deleteConversation_description"),
              [
                {
                  text: i18n.t("cancel"),
                  style: "cancel",
                },
                {
                  text: i18n.t("delete"),
                  style: "destructive",
                  onPress: () => {
                    deleteConversation(conversation.id);
                  },
                },
              ]
            )
          }
        >
          <FontAwesome name="trash" style={{ color: theme.colors.textAlt }} />
        </TouchableOpacity>
      </View>

      {!!conversation.note?.length && <MyText>{conversation.note}</MyText>}
      {hasNoConversationDetails && (
        <MyText>{i18n.t("noConversationNotesSaved")}</MyText>
      )}
      {(conversation.followUp?.notifyMe || conversation.followUp?.topic) && (
        <View style={{ gap: 5 }}>
          <Divider />
          <View
            style={{
              flexDirection: "row",
              gap: 5,
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <FontAwesome name="bell" style={{ color: theme.colors.textAlt }} />
            <MyText
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t("followUpInformation")}
              {notificationHasPassed
                ? ` - ${i18n.t("upcoming")}`
                : ` - ${i18n.t("past")}`}
            </MyText>
          </View>
          {conversation.followUp?.date && (
            <MyText
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: notificationHasPassed
                  ? theme.colors.accent3
                  : theme.colors.textAlt,
              }}
            >
              {moment(conversation.followUp.date).format("MMM DD, YYYY h:mm A")}
            </MyText>
          )}
          {conversation.followUp?.topic && (
            <MyText
              style={{
                color: notificationHasPassed
                  ? theme.colors.accent3
                  : theme.colors.textAlt,
              }}
            >
              {i18n.t("topic")} {conversation.followUp?.topic}
            </MyText>
          )}
        </View>
      )}
    </View>
  );
};

export default ConversationRow;
