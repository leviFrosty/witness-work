import {
  TouchableOpacity,
  View,
  Linking,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useEffect, useMemo } from "react";
import Text from "../components/MyText";
import theme from "../constants/theme";
import { RootStackParamList } from "../stacks/RootStack";
import {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import useContacts from "../stores/contactsStore";
import Header from "../components/layout/Header";
import { FontAwesome } from "@expo/vector-icons";
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

type Props = NativeStackScreenProps<RootStackParamList, "Contact Details">;

const iconSize = 18;

const PhoneRow = ({ contact }: { contact: Contact }) => {
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
        <Text onPress={() => Linking.openURL(`tel:${phone}`)}>{phone}</Text>
        <View
          style={{
            flexDirection: "row",
            gap: 25,
            alignItems: "center",
          }}
        >
          <FontAwesome
            name="phone"
            style={{
              fontSize: iconSize,
              color: theme.colors.accent,

              // backgroundColor: "orange",
            }}
            onPress={() => Linking.openURL(`tel:${phone}`)}
          />
          <FontAwesome
            name="comment"
            style={{
              fontSize: iconSize,
              color: theme.colors.accent,
              paddingBottom: 6,

              // backgroundColor: "red",
            }}
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
      <Text
        style={{
          fontSize: 40,
          fontFamily: "Inter_700Bold",
          color: theme.colors.textInverse,
        }}
      >
        {name}
      </Text>
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
          <FontAwesome
            style={{ color: theme.colors.textInverse, fontSize: 14 }}
            name="book"
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
      <TouchableOpacity onPress={() => navigateTo(address)}>
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
            {Object.keys(address).map((key) => {
              return <Text key={key}>{address[key as keyof Address]}</Text>;
            })}
          </View>
          <FontAwesome
            style={{ fontSize: iconSize, color: theme.colors.accent }}
            name="map-pin"
          />
        </View>
      </TouchableOpacity>
    </View>
  );
};

const EmailRow = ({ contact }: { contact: Contact }) => {
  const { email } = contact;
  if (!email) {
    return null;
  }

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
      <TouchableOpacity onPress={() => Linking.openURL(`mailTo:${email}`)}>
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
            <Text>{email}</Text>
          </View>
          <FontAwesome
            style={{ fontSize: iconSize, color: theme.colors.accent }}
            name="envelope"
          />
        </View>
      </TouchableOpacity>
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
  return (
    <View style={{ gap: 5 }}>
      <TouchableOpacity
        hitSlop={15}
        onPress={() =>
          Alert.alert(
            "Delete Contact?",
            "This contact will be deleted. You can restore it later from your deleted contacts.",
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
          {i18n.t("deleteContact")}
        </Text>
      </TouchableOpacity>
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
  const { params } = route;
  const insets = useSafeAreaInsets();
  const { contacts, deleteContact } = useContacts();
  const contact = useMemo(
    () => contacts.find((c) => c.id === params.id),
    [contacts, params.id]
  );
  const { conversations } = useConversations();

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
          title=""
          buttonType="exit"
          rightElement={
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 35,
                position: "absolute",
                right: 0,
              }}
            >
              <TouchableOpacity
                hitSlop={15}
                onPress={async () => {
                  navigation.replace("Contact Form", {
                    id: params.id,
                    edit: true,
                  });
                }}
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                <FontAwesome
                  name="pencil"
                  style={{ fontSize: 16, color: theme.colors.textInverse }}
                />
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    textDecorationLine: "underline",
                    fontSize: 16,
                  }}
                >
                  {i18n.t("edit")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                hitSlop={15}
                onPress={async () => {
                  navigation.replace("Conversation Form", {
                    id: params.id,
                    referrer: "Contact Details",
                  });
                }}
              >
                <FontAwesome
                  name="plus"
                  style={{ fontSize: 16, color: theme.colors.textInverse }}
                />
              </TouchableOpacity>
            </View>
          }
          backgroundColor={theme.colors.accent3}
        />
      ),
    });
  }, [navigation, params.id]);

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
      style={{ position: "relative", paddingTop: 100, marginTop: -100 }}
    >
      <View
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
        <View style={{ gap: 30, padding: 20 }}>
          <CardWithTitle title="Details" titleColor={theme.colors.textInverse}>
            <View style={{ gap: 15 }}>
              {hasAddress && <AddressRow contact={contact} />}
              {phone && <PhoneRow contact={contact} />}
              {!hasAddress && !phone && !email && (
                <Text>{i18n.t("noPersonalInformationSaved")}</Text>
              )}
              {email && <EmailRow contact={contact} />}
            </View>
          </CardWithTitle>
          <CardWithTitle noPadding title="Conversations History">
            <View style={{ minHeight: 2 }}>
              <FlashList
                renderItem={({ item }) => (
                  <ConversationRow conversation={item} />
                )}
                ItemSeparatorComponent={() => <Divider />}
                data={contactConversationsSorted}
                ListEmptyComponent={
                  <Text style={{ margin: 20 }}>
                    {i18n.t("tapPlusToAddConvo")}
                  </Text>
                }
                estimatedItemSize={70}
              />
            </View>
          </CardWithTitle>
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
      </View>
    </ScrollView>
  );
};

export default ContactDetails;
