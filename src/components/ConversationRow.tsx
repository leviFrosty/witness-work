import { Alert, TouchableOpacity, View } from "react-native";
import Text from "./MyText";
import { Conversation } from "../types/conversation";
import moment from "moment";
import useTheme from "../contexts/theme";
import { FontAwesome } from "@expo/vector-icons";
import Divider from "./Divider";
import useConversations from "../stores/conversationStore";
import i18n from "../lib/locales";

const ConversationRow = ({ conversation }: { conversation: Conversation }) => {
  const theme = useTheme();
  const { deleteConversation } = useConversations();
  const notificationHasPassed =
    conversation.followUp &&
    moment(conversation.followUp.date).isSameOrAfter(moment());

  const hasNoConversationDetails = !conversation.note?.length;

  return (
    <View
      style={{
        gap: 10,
        marginHorizontal: 15,
        marginVertical: 20,
        backgroundColor: theme.colors.background,
        borderRadius: theme.numbers.borderRadiusLg,
        paddingVertical: 22,
        paddingHorizontal: 12,
        position: "relative",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: "Inter_600SemiBold",
              // color: theme.colors.textAlt,
            }}
          >
            {moment(conversation.date).format("LL")}
          </Text>
        </View>

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

      {!!conversation.note?.length && <Text>{conversation.note}</Text>}
      {hasNoConversationDetails && (
        <Text>{i18n.t("noConversationNotesSaved")}</Text>
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
            <Text
              style={{
                fontSize: 12,
                fontFamily: "Inter_600SemiBold",
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t("followUpInformation")}
              {notificationHasPassed
                ? ` - ${i18n.t("upcoming")}`
                : ` - ${i18n.t("past")}`}
            </Text>
          </View>
          {conversation.followUp?.date && (
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: notificationHasPassed
                  ? theme.colors.accent3
                  : theme.colors.textAlt,
              }}
            >
              {moment(conversation.followUp.date).format("LLL")}
            </Text>
          )}
          {conversation.followUp?.topic && (
            <Text
              style={{
                color: notificationHasPassed
                  ? theme.colors.accent3
                  : theme.colors.textAlt,
              }}
            >
              {i18n.t("topic")}: {conversation.followUp?.topic}
            </Text>
          )}
        </View>
      )}
      {conversation.isBibleStudy && (
        <View
          style={{
            flexDirection: "row",
            gap: 5,
            alignItems: "center",
            position: "absolute",
            top: -7,
            left: -5,
            borderRadius: theme.numbers.borderRadiusLg,
            paddingHorizontal: 15,
            paddingVertical: 2,
            backgroundColor: theme.colors.accent3,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontFamily: "Inter_600SemiBold",
              color: theme.colors.textInverse,
            }}
          >
            {i18n.t("study")}
          </Text>
          <FontAwesome
            name="book"
            style={{ fontSize: 10, color: theme.colors.textInverse }}
          />
        </View>
      )}
    </View>
  );
};

export default ConversationRow;
