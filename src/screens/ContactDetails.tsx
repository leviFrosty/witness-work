import {
  View,
  Linking,
  Platform,
  Alert,
  ScrollView,
  useColorScheme,
} from "react-native";
import { useEffect, useMemo } from "react";
import Text from "../components/MyText";
import useTheme from "../contexts/theme";
import { RootStackParamList } from "../stacks/RootStack";
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import useContacts from "../stores/contactsStore";
import Header from "../components/layout/Header";
import CardWithTitle from "../components/CardWithTitle";
import { Address, Contact } from "../types/contact";
import { FlashList } from "@shopify/flash-list";
import ConversationRow from "../components/ConversationRow";
import useConversations from "../stores/conversationStore";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Divider from "../components/Divider";
import moment from "moment";
import i18n from "../lib/locales";
import {
  contactHasAtLeastOneStudy,
  contactMostRecentStudy,
  contactStudiedForGivenMonth,
} from "../lib/conversations";
import { Conversation } from "../types/conversation";
import Wrapper from "../components/Wrapper";
import { StatusBar } from "expo-status-bar";
import IconButton from "../components/IconButton";
import {
  faBook,
  faComment,
  faEnvelope,
  faLocationDot,
  faPencil,
  faPhone,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import Copyeable from "../components/Copyeable";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "Contact Details">;

const PhoneRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme();
  const { phone } = contact;
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t("phone")}
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Copyeable
          textProps={{ onPress: () => Linking.openURL(`tel:${phone}`) }}
        >
          {phone}
        </Copyeable>
        <View
          style={{
            flexDirection: "row",
            gap: 25,
            alignItems: "center",
          }}
        >
          <IconButton
            icon={faPhone}
            size="lg"
            iconStyle={{ color: theme.colors.accent }}
            onPress={() => Linking.openURL(`tel:${phone}`)}
          />
          <IconButton
            icon={faComment}
            size="lg"
            iconStyle={{ color: theme.colors.accent }}
            onPress={() => Linking.openURL(`sms:${phone}`)}
          />
        </View>
      </View>
    </View>
  );
};

const Hero = ({
  name,
  isBibleStudy: isActiveBibleStudy,
  hasStudiedPreviously,
  mostRecentStudy,
}: {
  name: string;
  isBibleStudy?: boolean;
  hasStudiedPreviously?: boolean;
  mostRecentStudy: Conversation | null;
}) => {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingVertical: 100,
        gap: 8,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
          color: theme.colors.textInverse,
        }}
      >
        {i18n.t("contact")}
      </Text>
      <Copyeable
        textProps={{
          style: {
            fontSize: 40,
            fontFamily: "Inter_700Bold",
            color: theme.colors.textInverse,
          },
        }}
      >
        {name}
      </Copyeable>
      {hasStudiedPreviously && mostRecentStudy && (
        <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
          <Text
            style={{
              fontSize: 16,
              fontFamily: "Inter_500Medium",
              color: theme.colors.textInverse,
            }}
          >
            {isActiveBibleStudy
              ? i18n.t("isStudying")
              : `${i18n.t("lastStudied")} ${moment(mostRecentStudy.date).format(
                  "L"
                )}`}
          </Text>
          <IconButton
            icon={faBook}
            iconStyle={{ color: theme.colors.textInverse }}
          />
        </View>
      )}
      {!isActiveBibleStudy && hasStudiedPreviously && (
        <Text
          style={{ fontSize: 12, color: theme.colors.textAlt, maxWidth: 250 }}
        >
          {i18n.t("inactiveBibleStudiesDoNoCountTowardsMonthlyTotals")}
        </Text>
      )}
    </View>
  );
};

const AddressRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme();
  const { address } = contact;
  if (!address) {
    return null;
  }

  const navigateTo = (a: Address) => {
    const scheme = Platform.select({
      ios: "maps://0,0?q=",
      android: "geo:0,0?q=",
    });
    const address = `${
      a.line1
    }${` ${a.line2}`}${` ${a.city}`}${`, ${a.state}`}${` ${a.zip}`}`;
    const url = Platform.select({
      ios: `${scheme}${address}`,
      android: `${scheme}${address}`,
    });
    if (!url) {
      return;
    }
    Linking.openURL(url);
  };

  const addressAsSingleString = Object.keys(address).reduce(
    (prev, line, index) =>
      !address[line as keyof Address]?.length
        ? prev
        : (prev += `${index !== 0 ? " " : ""}${
            address[line as keyof Address]
          }`),
    ""
  );

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t("address")}
      </Text>

      <Button onPress={() => navigateTo(address)}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Copyeable
            text={addressAsSingleString}
            onPress={() => navigateTo(address)}
          >
            <View
              style={{
                flexDirection: "column",
                justifyContent: "center",
                gap: 5,
              }}
            >
              {Object.keys(address).map((key) => {
                if (address[key as keyof Address]) {
                  return <Text key={key}>{address[key as keyof Address]}</Text>;
                }
              })}
            </View>
          </Copyeable>
          <IconButton
            size="lg"
            iconStyle={{ color: theme.colors.accent }}
            icon={faLocationDot}
          />
        </View>
      </Button>
    </View>
  );
};

const EmailRow = ({ contact }: { contact: Contact }) => {
  const theme = useTheme();
  const { email } = contact;
  if (!email) {
    return null;
  }

  const openMail = async () => {
    try {
      await Linking.openURL(`mailTo:${email}`);
    } catch (error) {
      Alert.alert(i18n.t("error"), i18n.t("failedToOpenMailApplication"));
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontSize: 14,
          fontFamily: "Inter_600SemiBold",
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t("email")}
      </Text>
      <Button onPress={openMail}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Copyeable>{email}</Copyeable>
          </View>
          <IconButton
            size="lg"
            iconStyle={{ color: theme.colors.accent }}
            icon={faEnvelope}
          />
        </View>
      </Button>
    </View>
  );
};

const DeleteContactButton = ({
  contact,
  deleteContact,
  navigation,
  contactId,
}: {
  deleteContact: (id: string) => void;
  navigation: NativeStackNavigationProp<
    RootStackParamList,
    "Contact Details",
    undefined
  >;
  contactId: string;
  contact: Contact;
}) => {
  const theme = useTheme();

  return (
    <View style={{ gap: 5 }}>
      <Button
        onPress={() =>
          Alert.alert(
            i18n.t("archiveContact_question"),
            i18n.t("archiveContact_description"),
            [
              {
                text: i18n.t("cancel"),
                style: "cancel",
              },
              {
                text: i18n.t("delete"),
                style: "destructive",
                onPress: () => {
                  deleteContact(contactId);
                  navigation.popToTop();
                },
              },
            ]
          )
        }
      >
        <Text
          style={{
            fontFamily: "Inter_600SemiBold",
            textAlign: "center",
            fontSize: 10,
            textDecorationLine: "underline",
          }}
        >
          {i18n.t("archiveContact")}
        </Text>
      </Button>
      <Text
        style={{
          fontSize: 10,
          color: theme.colors.textAlt,
          textAlign: "center",
        }}
      >
        {i18n.t("created")} {moment(contact.createdAt).format("LL")}
      </Text>
    </View>
  );
};

const ContactDetails = ({ route, navigation }: Props) => {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const { params } = route;
  const insets = useSafeAreaInsets();
  const { contacts, deleteContact } = useContacts();
  const contact = useMemo(
    () => contacts.find((c) => c.id === params.id),
    [contacts, params.id]
  );
  const { conversations } = useConversations();

  const highlightedConversation = useMemo(
    () => conversations.find((c) => c.id === params.highlightedConversationId),
    [conversations, params.highlightedConversationId]
  );

  const contactConversations = useMemo(
    () => conversations.filter(({ contact: { id } }) => id === contact?.id),
    [contact?.id, conversations]
  );

  const contactConversationsSorted = useMemo(
    () =>
      contactConversations.sort((a, b) =>
        moment(a.date).unix() < moment(b.date).unix() ? 1 : -1
      ),
    [contactConversations]
  );

  useEffect(() => {
    navigation.setOptions({
      header: ({ navigation }) => (
        <Header
          inverseTextAndIconColor
          noBottomBorder
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
              <Button
                onPress={async () => {
                  navigation.replace("Contact Form", {
                    id: params.id,
                    edit: true,
                  });
                }}
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                <IconButton
                  icon={faPencil}
                  iconStyle={{ color: theme.colors.textInverse }}
                />
              </Button>
              <IconButton
                onPress={async () => {
                  navigation.replace("Conversation Form", {
                    contactId: contact?.id,
                  });
                }}
                iconStyle={{ color: theme.colors.textInverse }}
                icon={faPlus}
              />
            </View>
          }
          backgroundColor={theme.colors.accent3}
        />
      ),
    });
  }, [
    contact?.id,
    navigation,
    params.id,
    theme.colors.accent3,
    theme.colors.textInverse,
  ]);

  const isActiveBibleStudy = useMemo(
    () =>
      contact
        ? contactStudiedForGivenMonth({
            contact,
            conversations,
            month: new Date(),
          })
        : false,
    [contact, conversations]
  );

  const hasStudiedPreviously = useMemo(
    () =>
      contact
        ? contactHasAtLeastOneStudy({
            conversations,
            contact,
          })
        : false,
    [contact, conversations]
  );

  const mostRecentStudy = useMemo(
    () => (contact ? contactMostRecentStudy({ conversations, contact }) : null),
    [contact, conversations]
  );

  if (!contact) {
    return (
      <Text style={{ fontSize: 18, marginTop: 15 }}>
        {i18n.t("contactNotFoundForProvidedId")} {params.id}
      </Text>
    );
  }

  const { name, address, phone, email } = contact;

  const hasAddress =
    address && Object.values(address).some((v) => v.length > 0);

  return (
    <ScrollView
      style={{
        position: "relative",
        paddingTop: 100,
        marginTop: -100,
        backgroundColor: theme.colors.background,
      }}
    >
      <StatusBar style={colorScheme === "light" ? "light" : "dark"} />
      <Wrapper
        noInsets
        style={{
          marginBottom: insets.bottom + 100,
          flexGrow: 1,
          flex: 1,
        }}
      >
        <Hero
          isBibleStudy={isActiveBibleStudy}
          hasStudiedPreviously={hasStudiedPreviously}
          mostRecentStudy={mostRecentStudy}
          name={name}
        />
        <View style={{ gap: 30 }}>
          <CardWithTitle
            titlePosition="inside"
            title="Details"
            style={{ margin: 20 }}
          >
            <View style={{ gap: 15 }}>
              {hasAddress && <AddressRow contact={contact} />}
              {phone && <PhoneRow contact={contact} />}
              {!hasAddress && !phone && !email && (
                <Text>{i18n.t("noPersonalInformationSaved")}</Text>
              )}
              {email && <EmailRow contact={contact} />}
            </View>
          </CardWithTitle>
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Inter_600SemiBold",
                marginLeft: 10,
                color: theme.colors.text,
              }}
            >
              {i18n.t("conversationHistory")}
            </Text>
            <View style={{ minHeight: 2 }}>
              <FlashList
                renderItem={({ item }) => (
                  <ConversationRow
                    conversation={item}
                    highlighted={item.id === highlightedConversation?.id}
                  />
                )}
                ItemSeparatorComponent={() => <Divider borderWidth={2} />}
                data={contactConversationsSorted}
                ListEmptyComponent={
                  <View
                    style={{
                      backgroundColor: theme.colors.backgroundLighter,
                      paddingVertical: 10,
                    }}
                  >
                    <Button
                      onPress={() =>
                        navigation.replace("Conversation Form", {
                          contactId: contact.id,
                        })
                      }
                    >
                      <Text
                        style={{ margin: 20, textDecorationLine: "underline" }}
                      >
                        {i18n.t("tapToAddAConversation")}
                      </Text>
                    </Button>
                  </View>
                }
                estimatedItemSize={70}
              />
            </View>
          </View>
          <DeleteContactButton
            contact={contact}
            contactId={params.id}
            deleteContact={deleteContact}
            navigation={navigation}
          />
        </View>
        <View
          style={{
            position: "absolute",
            height: 360,
            width: "100%",
            zIndex: -100,
            backgroundColor: theme.colors.accent3,
          }}
        />
        {Platform.OS === "ios" && (
          <View
            style={{
              backgroundColor: theme.colors.accent3,
              height: 1000,
              position: "absolute",
              top: -1000,
              left: 0,
              right: 0,
            }}
          />
        )}
      </Wrapper>
    </ScrollView>
  );
};

export default ContactDetails;
