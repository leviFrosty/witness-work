import { PropsWithChildren, useState } from "react";
import { i18n, translationKeys } from "../lib/translations";
// import useSettingStore from "../stores/SettingsStore";
import { StyleSheet, View } from "react-native";
import appTheme from "../lib/theme";
import { IndexPath, Select, SelectItem, Text } from "@ui-kitten/components";

interface SettingsScreenProps {}

const SettingsScreen: React.FC<PropsWithChildren<SettingsScreenProps>> = () => {
  // const { language, setLanguage } = useSettingStore();
  const [languageIndex, setLanguageIndex] = useState<IndexPath | IndexPath[]>(
    new IndexPath(0)
  );

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
  });

  console.log(languageIndex);

  // const handleSetLanguage = (value?: string) => {
  //   setLanguage(languageIndex);
  // };

  return (
    <View style={styles.wrapper}>
      <Text category="h2">{i18n.t("preferences")}</Text>
      <Select
        label={(evaProps) => (
          <Text {...evaProps}>{i18n.t("selectLanguage")}</Text>
        )}
        placeholder={i18n.t("language")}
        selectedIndex={languageIndex}
        onSelect={(index) => setLanguageIndex(index)}
      >
        {translationKeys.map((translationCode) => (
          <SelectItem
            key={translationCode}
            title={() => <Text>{i18n.t(translationCode)}</Text>}
          />
        ))}
      </Select>
    </View>
  );
};

export default SettingsScreen;
