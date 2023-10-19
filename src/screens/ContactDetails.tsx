import {
  TouchableOpacity,
  View,
  Linking,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useEffect, useMemo } from "react";
import MyText from "../components/MyText";
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

type Props = NativeStackScreenProps<RootStackParamList, "Contact Details">;

const iconSize = 18;

const PhoneRow = ({ contact }: { contact: Contact }) => {
  const { phone } = contact;
  return (
    <View style={{ gap: 10 }}>
      <MyText
        style={{ fontSize: 14, fontWeight: "600", color: theme.colors.textAlt }}
      >
        Phone
      </MyText>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <MyText onPress={() => Linking.openURL(`tel:${phone}`)}>{phone}</MyText>
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
  isBibleStudy,
}: {
  name: string;
  isBibleStudy?: boolean;
}) => {
  return (
    <View
      style={{
        paddingVertical: 100,
        gap: 5,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <MyText
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: theme.colors.textInverse,
        }}
      >
        Contact
      </MyText>
      <MyText
        style={{
          fontSize: 40,
          fontWeight: "700",
          color: theme.colors.textInverse,
        }}
      >
        {name}
      </MyText>
      {isBibleStudy && (
        <View style={{ flexDirection: "row", gap: 5, alignItems: "center" }}>
          <MyText
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: theme.colors.textInverse,
            }}
          >
            is studying
          </MyText>
          <FontAwesome
            style={{ color: theme.colors.textInverse, fontSize: 14 }}
            name="book"
          />
        </View>
      )}
    </View>
  );
};

const AddressRow = ({ contact }: { contact: Contact }) => {
  const { address } = contact;
  if (!address) {
    return;
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
      <MyText
        style={{ fontSize: 14, fontWeight: "600", color: theme.colors.textAlt }}
      >
        Address
      </MyText>
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
              return <MyText key={key}>{address[key as keyof Address]}</MyText>;
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
    return;
  }

  return (
    <View style={{ gap: 10 }}>
      <MyText
        style={{ fontSize: 14, fontWeight: "600", color: theme.colors.textAlt }}
      >
        Email
      </MyText>
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
            <MyText>{email}</MyText>
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
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Delete",
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
        <MyText
          style={{
            fontWeight: "600",
            textAlign: "center",
            fontSize: 10,
            textDecorationLine: "underline",
          }}
        >
          Delete Contact
        </MyText>
      </TouchableOpacity>
      <MyText
        style={{
          fontSize: 10,
          color: theme.colors.textAlt,
          textAlign: "center",
        }}
      >
        Created: {moment(contact.createdAt).format("MMM DD, YYYY")}
      </MyText>
    </View>
  );
};

const ContactDetails = ({ route, navigation }: Props) => {
  const { params } = route;
  const insets = useSafeAreaInsets();
  const { contacts, deleteContact } = useContacts();
  const contact = contacts.find((c) => c.id === params.id);
  const { conversations } = useConversations();

  const contactConversations = conversations.filter(
    ({ contact: { id } }) => id === contact?.id
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
                <MyText
                  style={{
                    color: theme.colors.textInverse,
                    textDecorationLine: "underline",
                    fontSize: 16,
                  }}
                >
                  Edit
                </MyText>
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

  if (!contact) {
    return (
      <MyText style={{ fontSize: 18, marginTop: 15 }}>
        Contact not found for provided ID: {params.id}
      </MyText>
    );
  }

  const { name, address, isBibleStudy, phone, email } = contact;

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
        <Hero isBibleStudy={isBibleStudy} name={name} />
        <View style={{ gap: 30, padding: 20 }}>
          <CardWithTitle title="Details" titleColor={theme.colors.textInverse}>
            <View style={{ gap: 15 }}>
              {hasAddress && <AddressRow contact={contact} />}
              {phone && <PhoneRow contact={contact} />}
              {!hasAddress && !phone && !email && (
                <MyText>No personal information saved. 🧐</MyText>
              )}
              {email && <EmailRow contact={contact} />}
            </View>
          </CardWithTitle>
          <CardWithTitle title="Conversations History">
            <View style={{ minHeight: 2 }}>
              <FlashList
                renderItem={({ item }) => (
                  <ConversationRow conversation={item} />
                )}
                ItemSeparatorComponent={() => <Divider marginVertical={15} />}
                data={contactConversationsSorted}
                ListEmptyComponent={
                  <MyText>
                    Tap the plus icon above to add a conversation.
                  </MyText>
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
