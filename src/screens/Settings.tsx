import { View } from "react-native";
import MyText from "../components/MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import theme from "../constants/theme";
import Section from "../components/inputs/Section";
import { TouchableOpacity } from "react-native-gesture-handler";
import { usePreferences } from "../stores/preferences";
const Settings = () => {
  const { set: setPreferences } = usePreferences();
  const insets = useSafeAreaInsets();
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
          <MyText style={{ fontSize: 16, fontWeight: "600" }}>Settings</MyText>
        </View>
        <Section>
          <TouchableOpacity
            onPress={() => setPreferences({ onboardingComplete: false })}
          >
            <MyText style={{ fontWeight: "600", color: theme.colors.text }}>
              Restart Setup
            </MyText>
          </TouchableOpacity>
        </Section>
        <Section>
          <TouchableOpacity
            onPress={() => setPreferences({ onboardingComplete: false })}
          >
            <MyText style={{ fontWeight: "600", color: theme.colors.text }}>
              Restart Setup
            </MyText>
          </TouchableOpacity>
        </Section>
      </View>
    </View>
  );
};

export default Settings;
