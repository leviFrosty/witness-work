import { useCallback } from "react";
import { Pressable, View } from "react-native";
import MyText from "../components/MyText";
import * as Notifications from "expo-notifications";
import * as Crypto from "expo-crypto";
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { RootStackParamList } from "../stacks/RootStack";
import useContacts from "../stores/contactsStore";
import { useEffect, useState } from "react";
import Header from "../components/layout/Header";
import theme from "../constants/theme";
import Divider from "../components/Divider";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Section from "../components/inputs/Section";
import { FontAwesome } from "@expo/vector-icons";
import { Conversation, Notification } from "../types/conversation";
import InputRowContainer from "../components/inputs/InputRowContainer";
import RNDateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import TextInputRow from "../components/inputs/TextInputRow";
import CheckboxWithLabel from "../components/inputs/CheckboxWithLabel";
import { Contact } from "../types/contact";
import moment from "moment";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useConversations from "../stores/conversationStore";

type Props = NativeStackScreenProps<RootStackParamList, "Conversation Form">;

const AssignmentSection = ({
  selectedContact,
  set_selectedContactId,
  navigation,
  errors,
}: {
  selectedContact: Contact | undefined;
  set_selectedContactId: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;
  errors: Record<string, string>;
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    "Conversation Form",
    undefined
  >;
}) => {
  return (
    <Section>
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 15,
            paddingRight: 20,
            borderColor: theme.colors.error,
            borderWidth: errors["contact"] ? 1 : 0,
          }}
        >
          {selectedContact ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <FontAwesome name="id-badge" style={{ fontSize: 16 }} />
              <MyText style={{ fontWeight: "600", fontSize: 16 }}>
                {selectedContact.name}
              </MyText>
            </View>
          ) : (
            <MyText>No contact assigned</MyText>
          )}
          <Pressable
            onPress={() =>
              selectedContact
                ? set_selectedContactId("")
                : navigation.navigate("Contact Selector")
            }
          >
            <MyText
              style={{
                color: theme.colors.textAlt,
                textDecorationLine: "underline",
              }}
            >
              {selectedContact ? "Unassign" : "Assign"}
            </MyText>
          </Pressable>
        </View>
        {errors["contact"] && (
          <MyText
            style={{
              textAlign: "right",
              paddingRight: 20,
              color: theme.colors.error,
            }}
          >
            {errors["contact"]}
          </MyText>
        )}
      </View>
    </Section>
  );
};

const ConversationForm = ({ route, navigation }: Props) => {
  const { params } = route;
  const { contacts } = useContacts();
  const [_selectedContactId, set_selectedContactId] = useState<string>();
  const assignedContactId = _selectedContactId ?? params.id;
  const [errors, setErrors] = useState<Record<string, string>>({
    contact: "",
  });
  const insets = useSafeAreaInsets();
  const [conversation, setConversation] = useState<Conversation>({
    id: Crypto.randomUUID(),
    contact: {
      id: assignedContactId,
    },
    date: new Date(),
    note: "",
    followUp: {
      date: new Date(),
      topic: "",
      notifyMe: false,
    },
  });
  const setNotifyMe = (notifyMe: boolean) => {
    setConversation({
      ...conversation,
      followUp: {
        ...conversation.followUp!,
        notifyMe,
      },
    });
  };

  const selectedContact = contacts.find((c) => c.id === assignedContactId);
  const { addConversation } = useConversations();
  const [notificationsAllowed, setNotificationsAllowed] =
    useState<boolean>(false);

  useEffect(() => {
    const fetchNotificationsSetting = async () => {
      const { granted } = await Notifications.getPermissionsAsync();
      setNotificationsAllowed(granted);
    };
    fetchNotificationsSetting();
  }, []);

  const handleDateChange = (_: DateTimePickerEvent, date: Date | undefined) => {
    if (!date) {
      return;
    }
    setConversation({
      ...conversation,
      date,
    });
  };

  const handleFollowUpDateChange = (
    _: DateTimePickerEvent,
    date: Date | undefined
  ) => {
    if (!date) {
      return;
    }
    setConversation({
      ...conversation,
      followUp: conversation.followUp && {
        ...conversation.followUp,
        date,
      },
    });
  };

  const validate = useCallback((): boolean => {
    if (!conversation.contact.id) {
      setErrors({ contact: "You must assign a conversation to a contact." });
      return false;
    }
    if (conversation.contact.id) {
      setErrors({ contact: "" });
    }
    return true;
  }, [conversation]);

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      const passValidation = validate();
      if (!passValidation) {
        return resolve(false);
      }

      const scheduleNotifications = async () => {
        if (!conversation.followUp) {
          return [];
        }

        const notifications: Notification[] = [];

        const twoHoursBeforeDate = moment(conversation.followUp.date)
          .subtract(2, "hours")
          .toDate();
        if (moment(twoHoursBeforeDate).isAfter(moment())) {
          try {
            const notificationId1 =
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "Conversation Reminder",
                  body: `Hey! Your chat with ${
                    selectedContact!.name
                  } is in 2 hours.📌${
                    conversation.followUp.topic &&
                    `\nTopic: ${conversation.followUp.topic}`
                  }`,
                  data: { data: "goes here" },
                  sound: true,
                },
                trigger: {
                  date: twoHoursBeforeDate,
                },
              });
            notifications.push({
              date: twoHoursBeforeDate,
              id: notificationId1,
            });
          } catch (error) {
            console.error(error);
          }
        }

        const fifteenMinutesBeforeDate = moment(conversation.followUp.date)
          .subtract(15, "minutes")
          .toDate();

        if (moment(twoHoursBeforeDate).isAfter(moment())) {
          try {
            const notificationId2 =
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: "Conversation Reminder",
                  body: `⏰ Your chat with ${
                    selectedContact!.name
                  } is in 15 mins. Prep up and get ready for a fruitful conversation!🚀📖${
                    conversation.followUp.topic &&
                    `\nTopic: ${conversation.followUp.topic}`
                  }`,
                  data: { data: "goes here" },
                  sound: true,
                },
                trigger: {
                  date: fifteenMinutesBeforeDate,
                },
              });
            notifications.push({
              date: fifteenMinutesBeforeDate,
              id: notificationId2,
            });
          } catch (error) {
            console.error(error);
          }
        }

        try {
          const notificationId3 = await Notifications.scheduleNotificationAsync(
            {
              content: {
                title: "Conversation Reminder",
                body: `It's time for your chat with ${
                  selectedContact!.name
                } now.🎉${
                  conversation.followUp.topic &&
                  `\nTopic: ${conversation.followUp.topic}`
                }`,
                data: { data: "goes here" },
                sound: true,
              },
              trigger: { date: conversation.followUp.date },
            }
          );
          notifications.push({
            date: conversation.followUp!.date,
            id: notificationId3,
          });
        } catch (error) {
          console.error(error);
        }

        return notifications;
      };

      if (conversation.followUp?.notifyMe && notificationsAllowed) {
        scheduleNotifications()
          .then((notifications) => {
            const conversationWithIds: Conversation = {
              ...conversation,
              followUp: {
                ...conversation.followUp!,
                notifications,
              },
            };
            addConversation(conversationWithIds);
            resolve(conversation);
          })
          .catch((error) => {
            console.error(error);
            resolve(false);
          });
      } else {
        addConversation(conversation);
        resolve(conversation);
      }
    });
  }, [
    addConversation,
    conversation,
    notificationsAllowed,
    selectedContact,
    validate,
  ]);

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          title=""
          buttonType="exit"
          rightElement={
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 20,
                position: "absolute",
                right: 0,
              }}
            >
              {!params.referrer && (
                <Pressable
                  hitSlop={15}
                  onPress={async () => {
                    navigation.popToTop();
                  }}
                >
                  <MyText
                    style={{
                      color: theme.colors.textInverse,
                      fontSize: 12,
                    }}
                  >
                    Skip
                  </MyText>
                </Pressable>
              )}
              <Pressable
                hitSlop={15}
                onPress={async () => {
                  const succeeded = await submit();
                  if (!succeeded) {
                    // Failed validation if didn't submit
                    return;
                  }
                  if (params.referrer) {
                    navigation.replace(params.referrer, { id: params.id });
                    return;
                  }
                  navigation.popToTop();
                }}
              >
                <MyText
                  style={{
                    color: theme.colors.textInverse,
                    textDecorationLine: "underline",
                    fontSize: 16,
                  }}
                >
                  {params.referrer ? "Add" : "Save"}
                </MyText>
              </Pressable>
            </View>
          }
        />
      ),
    });
  }, [navigation, params.id, params.referrer, submit]);

  return (
    <KeyboardAwareScrollView
      automaticallyAdjustKeyboardInsets
      style={{ marginBottom: insets.bottom }}
    >
      <View style={{ gap: 30 }}>
        <View style={{ padding: 25, paddingBottom: 0, gap: 5 }}>
          <MyText style={{ fontSize: 32, fontWeight: "700" }}>
            Add Conversation
          </MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            Enter the contact information below for the person you will be
            adding to JW Time.
          </MyText>
        </View>
        <AssignmentSection
          errors={errors}
          navigation={navigation}
          selectedContact={selectedContact}
          set_selectedContactId={set_selectedContactId}
        />
        <Divider borderStyle="dashed" />
        <Section>
          <InputRowContainer label="Date" justifyContent="space-between">
            <RNDateTimePicker
              maximumDate={moment().toDate()}
              value={conversation.date}
              onChange={handleDateChange}
            />
          </InputRowContainer>
          <TextInputRow
            label="Note"
            placeholder="Write down information about your conversation. Be sure to be descriptive!"
            textInputProps={{
              multiline: true,
              textAlign: "left",
              returnKeyType: "default",
              onChangeText: (note: string) =>
                setConversation({ ...conversation, note }),
            }}
            lastInSection
          />
        </Section>
        <Section>
          <InputRowContainer label="Follow Up" justifyContent="space-between">
            <RNDateTimePicker
              mode="datetime"
              minimumDate={moment().toDate()}
              value={conversation.followUp!.date}
              onChange={handleFollowUpDateChange}
            />
          </InputRowContainer>
          <TextInputRow
            label="Topic"
            placeholder="Enter topic, e.g., Enjoy Life Forever Ch. 1"
            textInputProps={{
              returnKeyType: "default",
              onChangeText: (topic: string) =>
                setConversation({
                  ...conversation,
                  followUp: conversation.followUp && {
                    ...conversation.followUp,
                    topic,
                  },
                }),
            }}
          />
          <InputRowContainer
            label="Notify Me"
            justifyContent="space-between"
            lastInSection
          >
            <CheckboxWithLabel
              label=""
              value={conversation.followUp?.notifyMe || false}
              setValue={setNotifyMe}
              disabled={!notificationsAllowed}
              description="Notifications are disabled. Enable them via device settings to use this feature."
              descriptionOnlyOnDisabled
            />
          </InputRowContainer>
        </Section>
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ConversationForm;
