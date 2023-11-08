import { useCallback } from "react";
import { Pressable, View, Platform } from "react-native";
import Text from "../components/MyText";
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
import i18n from "../lib/locales";
import AndroidDateTimePicker from "../components/AndroidDateTimePicker";
import Checkbox from "expo-checkbox";
import { Dropdown } from "react-native-element-dropdown";

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
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16 }}>
                {selectedContact.name}
              </Text>
            </View>
          ) : (
            <Text>{i18n.t("noContactAssigned")}</Text>
          )}
          <Pressable
            onPress={() =>
              selectedContact
                ? set_selectedContactId("")
                : navigation.navigate("Contact Selector")
            }
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                textDecorationLine: "underline",
              }}
            >
              {selectedContact ? i18n.t("unassign") : i18n.t("assign")}
            </Text>
          </Pressable>
        </View>
        {errors["contact"] && (
          <Text
            style={{
              textAlign: "right",
              paddingRight: 20,
              color: theme.colors.error,
            }}
          >
            {errors["contact"]}
          </Text>
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

  const [notifyMeOffset, setNotifyMeOffset] = useState<{
    amount?: number;
    unit?: moment.unitOfTime.DurationConstructor | undefined;
  }>({
    amount: 2,
    unit: "hours",
  });

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
    isBibleStudy: false,
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
      setErrors({ contact: i18n.t("youMustAssignAConversationToContact") });
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

        const selectedDate = moment(conversation.followUp?.date)
          .subtract(notifyMeOffset.amount, notifyMeOffset.unit)
          .toDate();

        const getRandomEmoji = () => {
          const emojis = [
            "😀",
            "✨",
            "🚀",
            "⭐",
            "🎉",
            "💨",
            "👀",
            "💪",
            "⏱️",
            "🌟",
          ];
          const randomIndex = Math.floor(Math.random() * emojis.length);
          return emojis[randomIndex];
        };

        if (moment(selectedDate).isAfter(moment())) {
          try {
            const id = await Notifications.scheduleNotificationAsync({
              content: {
                title: i18n.t("reminder_title"),
                body: `${i18n.t("notification_part1")} ${
                  selectedContact!.name
                } ${i18n.t("notification_part2")} ${notifyMeOffset.amount} ${
                  notifyMeOffset.unit
                }. ${getRandomEmoji()}${
                  conversation.followUp.topic &&
                  `${i18n.t("reminder_topic")}${conversation.followUp.topic}`
                }`,
                sound: true,
              },
              trigger: {
                date: selectedDate,
              },
            });

            notifications.push({
              date: selectedDate,
              id,
            });
          } catch (error) {
            console.error(error);
          }
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
    notifyMeOffset.amount,
    notifyMeOffset.unit,
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
                  <Text
                    style={{
                      color: theme.colors.textInverse,
                      fontSize: 12,
                    }}
                  >
                    {i18n.t("skip")}
                  </Text>
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
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    textDecorationLine: "underline",
                    fontSize: 16,
                  }}
                >
                  {params.referrer ? i18n.t("add") : i18n.t("save")}
                </Text>
              </Pressable>
            </View>
          }
        />
      ),
    });
  }, [navigation, params.id, params.referrer, submit]);

  const IsBibleStudyCheckbox = () => {
    const setIsBibleStudy = (isBibleStudy: boolean) => {
      setConversation({
        ...conversation,
        isBibleStudy,
      });
    };

    return (
      <Pressable
        style={{ flexDirection: "row", gap: 10, marginLeft: 20 }}
        onPress={() => setIsBibleStudy(!conversation.isBibleStudy)}
      >
        <Checkbox
          value={conversation.isBibleStudy}
          onValueChange={(val) => setIsBibleStudy(val)}
        />
      </Pressable>
    );
  };

  const amountOptions = [...Array(1000).keys()].map((value) => ({
    label: `${value}`,
    value,
  }));
  const unitOptions: {
    label: string;
    value: moment.unitOfTime.DurationConstructor;
  }[] = ["minutes", "hours", "days", "weeks"].map((value) => ({
    label: i18n.t(`${value}_lowercase`),
    value: value as moment.unitOfTime.DurationConstructor,
  }));

  return (
    <KeyboardAwareScrollView
      automaticallyAdjustKeyboardInsets
      style={{ marginBottom: insets.bottom }}
    >
      <View style={{ gap: 30 }}>
        <View style={{ padding: 25, paddingBottom: 0, gap: 5 }}>
          <Text style={{ fontSize: 32, fontFamily: "Inter_700Bold" }}>
            {i18n.t("addConversation")}
          </Text>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {i18n.t("addConversation_description")}
          </Text>
        </View>
        <AssignmentSection
          errors={errors}
          navigation={navigation}
          selectedContact={selectedContact}
          set_selectedContactId={set_selectedContactId}
        />
        <Divider borderStyle="dashed" />
        <Section>
          <InputRowContainer
            label={i18n.t("date")}
            justifyContent="space-between"
          >
            {Platform.OS === "android" ? (
              <AndroidDateTimePicker
                maximumDate={moment().toDate()}
                value={conversation.date}
                onChange={handleDateChange}
              />
            ) : (
              <RNDateTimePicker
                maximumDate={moment().toDate()}
                value={conversation.date}
                onChange={handleDateChange}
              />
            )}
          </InputRowContainer>
          <TextInputRow
            label={i18n.t("note")}
            placeholder={i18n.t("note_placeholder")}
            textInputProps={{
              multiline: true,
              textAlign: "left",
              returnKeyType: "default",
              onChangeText: (note: string) =>
                setConversation({ ...conversation, note }),
            }}
          />
          <InputRowContainer
            label={i18n.t("conductedBibleStudy")}
            justifyContent="space-between"
            lastInSection
          >
            <IsBibleStudyCheckbox />
          </InputRowContainer>
        </Section>
        <Section>
          <InputRowContainer
            label={i18n.t("followUp")}
            justifyContent="space-between"
          >
            {Platform.OS === "android" ? (
              <AndroidDateTimePicker
                minimumDate={moment().toDate()}
                value={conversation.followUp!.date}
                onChange={handleFollowUpDateChange}
                timeAndDate
              />
            ) : (
              <RNDateTimePicker
                mode="datetime"
                minimumDate={moment().toDate()}
                value={conversation.followUp!.date}
                onChange={handleFollowUpDateChange}
              />
            )}
          </InputRowContainer>
          <TextInputRow
            label={i18n.t("topic")}
            placeholder={i18n.t("topic_placeholder")}
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

          <InputRowContainer label={i18n.t("notification")} lastInSection>
            <View style={{ gap: 15, flex: 1 }}>
              <View
                style={{
                  justifyContent: "flex-end",
                  flex: 1,
                  flexDirection: "row",
                }}
              >
                <CheckboxWithLabel
                  label={i18n.t("notifyMe")}
                  value={conversation.followUp?.notifyMe || false}
                  setValue={setNotifyMe}
                  disabled={!notificationsAllowed}
                  description={i18n.t("notifyMe_description")}
                  descriptionOnlyOnDisabled
                />
              </View>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <View style={{ flex: 1 }}>
                  <Dropdown
                    data={amountOptions}
                    labelField={"label"}
                    dropdownPosition="top"
                    valueField={"value"}
                    style={{
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                    containerStyle={{
                      borderRadius: theme.numbers.borderRadiusSm,
                      backgroundColor: theme.colors.background,
                    }}
                    onChange={({ value: amount }) =>
                      setNotifyMeOffset({ ...notifyMeOffset, amount })
                    }
                    placeholder={notifyMeOffset.amount?.toString()}
                    value={notifyMeOffset.amount?.toString()}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Dropdown
                    data={unitOptions}
                    labelField={"label"}
                    dropdownPosition="top"
                    valueField={"value"}
                    style={{
                      backgroundColor: theme.colors.background,
                      borderColor: theme.colors.border,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      borderRadius: theme.numbers.borderRadiusSm,
                    }}
                    containerStyle={{
                      borderRadius: theme.numbers.borderRadiusSm,
                      backgroundColor: theme.colors.background,
                    }}
                    onChange={({ value: unit }) =>
                      setNotifyMeOffset({ ...notifyMeOffset, unit })
                    }
                    value={notifyMeOffset.unit}
                  />
                </View>
                <Text style={{ color: theme.colors.textAlt }}>
                  {i18n.t("before")}
                </Text>
              </View>
            </View>
          </InputRowContainer>
        </Section>
      </View>
    </KeyboardAwareScrollView>
  );
};

export default ConversationForm;
