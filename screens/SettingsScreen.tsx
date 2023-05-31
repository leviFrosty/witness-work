import { PropsWithChildren, useState } from "react";
import Layout from "../components/Layout";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import useSettingStore, {
  SYSTEM_PREFERENCE_KEY,
} from "../stores/SettingsStore";
import DropDown from "react-native-paper-dropdown";
import { Text, useTheme } from "react-native-paper";
import { View } from "react-native";

interface SettingsScreenProps {}

const SettingsScreen: React.FC<PropsWithChildren<SettingsScreenProps>> = () => {
  const { userPreferenceColorScheme, setUserPreferenceColorScheme } =
    useSettingStore();
  const [showColorSchemeDropDown, setShowColorSchemeDropDown] = useState(false);
  const theme = useTheme();

  const colorSchemeList = [
    {
      label: i18n.t("systemPreference"),
      value: SYSTEM_PREFERENCE_KEY,
    },
    {
      label: i18n.t("light"),
      value: "light",
    },
    {
      label: i18n.t("dark"),
      value: "dark",
    },
  ];

  return (
    <Layout>
      <ScreenTitle title={i18n.t("settings")} />
      <View>
        <Text>{i18n.t("system")}</Text>
        <DropDown
          list={colorSchemeList}
          value={userPreferenceColorScheme}
          label={i18n.t("theme")}
          mode={"outlined"}
          setValue={(value) => setUserPreferenceColorScheme(value)}
          visible={showColorSchemeDropDown}
          showDropDown={() => setShowColorSchemeDropDown(true)}
          onDismiss={() => setShowColorSchemeDropDown(false)}
          theme={theme}
        />
      </View>
    </Layout>
  );
};

export default SettingsScreen;
