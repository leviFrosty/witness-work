import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import MyText from "../components/MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import useContacts from "../stores/contactsStore";
import { View } from "react-native";
import SearchBar from "../components/SearchBar";
import { useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import Divider from "../components/Divider";
import ContactRow from "../components/ContactRow";
import i18n from "../lib/locales";

const ContactSelector = () => {
  const navigation = useNavigation<RootStackNavigation>();
  const { contacts } = useContacts();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");

  const searchResults = contacts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={{ flexGrow: 1, padding: 20, gap: 20 }}>
      <View style={{ gap: 20 }}>
        <MyText style={{ fontSize: 32, fontWeight: "700" }}>
          {i18n.t("assignContact")}
        </MyText>
        <SearchBar value={search} setValue={setSearch} />
      </View>
      <KeyboardAwareScrollView style={{ flexGrow: 1, paddingHorizontal: 10 }}>
        <View
          style={{
            flex: 1,
            flexGrow: 1,
            minHeight: 20,
            marginBottom: insets.bottom + insets.top + 50,
          }}
        >
          <FlashList
            data={searchResults}
            renderItem={({ item }) => (
              <ContactRow
                contact={item}
                onPress={() =>
                  navigation.replace("Conversation Form", { id: item.id })
                }
              />
            )}
            ItemSeparatorComponent={() => (
              <Divider borderStyle="dashed" marginVertical={10} />
            )}
            estimatedItemSize={16}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default ContactSelector;
