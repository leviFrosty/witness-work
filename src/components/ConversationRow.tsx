import { Alert, View } from "react-native";
import Text from "./MyText";
import { Conversation } from "../types/conversation";
import moment from "moment";
import useTheme from "../contexts/theme";
import useConversations from "../stores/conversationStore";
import i18n from "../lib/locales";
import { RootStackNavigation } from "../stacks/RootStack";
import { useNavigation } from "@react-navigation/native";
import { Swipeable } from "react-native-gesture-handler";
import Badge from "./Badge";
import Haptics from "../lib/haptics";
import SwipeableDelete from "./swipeableActions/Delete";
import SwipeableEdit from "./swipeableActions/Edit";
import IconButton from "./IconButton";
import { faBell, faBellSlash, faBook } from "@fortawesome/free-solid-svg-icons";
import Copyeable from "./Copyeable";

// TODO: Change display of upcoming followup notification status. If someone clicked "Notify Me", more clearly represent that. Currently, there is no difference between "notify me" and not
const ConversationRow = ({
  conversation,
  highlighted,
}: {
  conversation: Conversation;
  highlighted?: boolean;
}) => {
  const navigation = useNavigation<RootStackNavigation>();
  const theme = useTheme();
  const { deleteConversation } = useConversations();
  const notificationHasPassed =
    conversation.followUp &&
    moment(conversation.followUp.date).isSameOrBefore(moment());

  const hasNoConversationDetails = !conversation.note?.length;

  const handleSwipeOpen = (
    direction: "left" | "right",
    swipeable: Swipeable
  ) => {
    if (direction === "left") {
      navigation.replace("Conversation Form", {
        conversationToEditId: conversation.id,
      });
    } else {
      Alert.alert(
        i18n.t("deleteConversation"),
        i18n.t("deleteConversation_description"),
        [
          {
            text: i18n.t("cancel"),
            style: "cancel",
            onPress: () => {
              swipeable.reset();
            },
          },
          {
            text: i18n.t("delete"),
            style: "destructive",
            onPress: () => {
              swipeable.reset();
              deleteConversation(conversation.id);
            },
          },
        ]
      );
    }
  };

  return (
    <Swipeable
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{ backgroundColor: theme.colors.backgroundLighter }}
      renderLeftActions={() => <SwipeableEdit />}
      renderRightActions={() => <SwipeableDelete />}
      onSwipeableOpen={handleSwipeOpen}
    >
      <View
        style={{
          paddingHorizontal: 5,
          paddingVertical: 10,
          backgroundColor: theme.colors.card,
          borderWidth: highlighted ? 1 : 0,
          borderColor: highlighted ? theme.colors.accent : undefined,
        }}
      >
        <View
          style={{
            gap: 10,
            paddingVertical: 22,
            paddingHorizontal: 12,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontFamily: "Inter_600SemiBold",
                color: theme.colors.textAlt,
              }}
            >
              {moment(conversation.date).format("LL")}
            </Text>
            {conversation.isBibleStudy && (
              <Badge
                size="sm"
                color={theme.colors.accent3}
                textStyle={{
                  fontFamily: "Inter_600SemiBold",
                  color: theme.colors.textInverse,
                }}
              >
                <View
                  style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      textTransform: "uppercase",
                      fontSize: theme.fontSize("xs"),
                      color: theme.colors.textInverse,
                    }}
                  >
                    {i18n.t("study")}
                  </Text>
                  <IconButton
                    icon={faBook}
                    iconStyle={{ color: theme.colors.textInverse }}
                    size="xs"
                  />
                </View>
              </Badge>
            )}
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {(conversation.followUp?.notifyMe ||
              conversation.followUp?.topic) && (
              <View
                style={{
                  gap: 10,
                  borderColor: notificationHasPassed
                    ? theme.colors.border
                    : theme.colors.accent3,
                  borderWidth: 1,
                  borderRadius: theme.numbers.borderRadiusSm,
                  padding: 10,
                  flexShrink: 1,
                }}
              >
                <View style={{ gap: 3 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_600SemiBold",
                        color: theme.colors.textAlt,
                      }}
                    >
                      {i18n.t("followUp")}
                    </Text>
                  </View>
                  {conversation.followUp?.date && (
                    <View
                      style={{
                        flexDirection: "row",
                        padding: 5,
                        gap: 5,
                        alignItems: "center",
                      }}
                    >
                      <IconButton
                        icon={
                          conversation.followUp.notifyMe ? faBell : faBellSlash
                        }
                        iconStyle={{
                          color: notificationHasPassed
                            ? theme.colors.textAlt
                            : theme.colors.accent3,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontFamily: "Inter_600SemiBold",
                          color: notificationHasPassed
                            ? theme.colors.textAlt
                            : theme.colors.accent3,
                        }}
                      >
                        {moment(conversation.followUp.date).format("L LT")}
                      </Text>
                    </View>
                  )}
                </View>

                {conversation.followUp?.topic && (
                  <View style={{ gap: 3 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_600SemiBold",
                        color: theme.colors.textAlt,
                      }}
                    >
                      {i18n.t("topic")}
                    </Text>
                    <Copyeable
                      textProps={{
                        style: {
                          color: notificationHasPassed
                            ? theme.colors.textAlt
                            : theme.colors.accent3,
                        },
                      }}
                    >
                      {conversation.followUp?.topic}
                    </Copyeable>
                  </View>
                )}
              </View>
            )}
            {hasNoConversationDetails && (
              <Text
                style={{
                  flexShrink: 1,
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize("sm"),
                }}
              >
                {i18n.t("noConversationNotesSaved")}
              </Text>
            )}

            {!!conversation.note?.length && (
              <View style={{ gap: 3, flexShrink: 1 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_600SemiBold",
                    color: theme.colors.textAlt,
                  }}
                >
                  {i18n.t("note")}
                </Text>
                <Copyeable>{conversation.note}</Copyeable>
              </View>
            )}
          </View>
        </View>
      </View>
    </Swipeable>
  );
};

export default ConversationRow;
