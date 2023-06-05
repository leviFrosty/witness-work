import { PropsWithChildren, useEffect, useState } from "react";
import { i18n, translationKeys } from "../lib/translations";
// import useSettingStore from "../stores/SettingsStore";
import { StyleSheet, View } from "react-native";
import appTheme from "../lib/theme";
import {
  IndexPath,
  Layout,
  Select,
  SelectItem,
  Text,
} from "@ui-kitten/components";
import useSettingStore from "../stores/SettingsStore";
import TopNavBarWithBackButton from "../components/TopNavBarWithBackButton";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SettingsScreenProps {}

const SettingsScreen: React.FC<PropsWithChildren<SettingsScreenProps>> = () => {
  const { language, setLanguage } = useSettingStore();
  const [languageIndex, setLanguageIndex] = useState<IndexPath | IndexPath[]>(
    new IndexPath(translationKeys.indexOf(language || i18n.locale))
  );
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // @ts-ignore
    setLanguage(translationKeys[languageIndex.row]);
  }, [languageIndex]);

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
  });

  // useEffect(() => {
  //   // @ts-ignore
  //   i18n.locale = translationKeys[languageIndex.row];
  // }, [languageIndex]);

  return (
    <Layout style={styles.wrapper}>
      <TopNavBarWithBackButton title={i18n.t("settings")} />
      <Text category="s1">{i18n.t("preferences")}</Text>
      <Select
        label={(evaProps) => (
          <Text {...evaProps}>{i18n.t("selectLanguage")}</Text>
        )}
        // @ts-ignore
        value={i18n.t(translationKeys[languageIndex.row])}
        placeholder={i18n.t("language")}
        selectedIndex={languageIndex}
        onSelect={(index) => setLanguageIndex(index)}
        caption={i18n.t("changingLanguageCaption")}
      >
        {translationKeys.map((translationCode) => (
          <SelectItem
            key={translationCode}
            title={() => <Text>{i18n.t(translationCode)}</Text>}
          />
        ))}
      </Select>
    </Layout>
  );
};

export default SettingsScreen;
