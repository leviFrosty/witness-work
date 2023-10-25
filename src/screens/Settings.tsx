import { View } from "react-native";
import MyText from "../components/MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import theme from "../constants/theme";
import Section from "../components/inputs/Section";
import { TouchableOpacity } from "react-native-gesture-handler";
import { usePreferences } from "../stores/preferences";
import { FontAwesome } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import i18n from "../locales";

const Settings = () => {
  const { set: setPreferences } = usePreferences();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigation>();

  const resetToOnboarding = () => {
    setPreferences({ onboardingComplete: false });
  };

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: theme.colors.background,
        flexGrow: 1,
      }}
    >
      <View style={{ gap: 10 }}>
        <View style={{ padding: 20 }}>
          <MyText style={{ fontSize: 16, fontWeight: "600" }}>
            {i18n.t("settings")}
          </MyText>
        </View>
        <Section>
          <View style={{ marginRight: 20 }}>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onPress={resetToOnboarding}
            >
              <MyText style={{ fontWeight: "600", color: theme.colors.text }}>
                {i18n.t("restartOnboarding")}
              </MyText>
              <FontAwesome name="chevron-right" />
            </TouchableOpacity>
          </View>
        </Section>
        <Section>
          <View style={{ marginRight: 20 }}>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
              onPress={() => navigation.navigate("Recover Contacts")}
            >
              <MyText style={{ fontWeight: "600", color: theme.colors.text }}>
                Recover Contacts
                {i18n.t("recoverContacts")}
              </MyText>
              <FontAwesome name="chevron-right" />
            </TouchableOpacity>
          </View>
        </Section>
      </View>
    </View>
  );
};

export default Settings;
