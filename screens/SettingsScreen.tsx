import { PropsWithChildren, useState } from "react";
import { i18n, translationKeys } from "../lib/translations";
import useSettingStore from "../stores/SettingsStore";
import { StyleSheet, View } from "react-native";
import { FormControl, Heading, Select, Text, VStack } from "native-base";
import theme from "../lib/theme";

interface SettingsScreenProps {}

const SettingsScreen: React.FC<PropsWithChildren<SettingsScreenProps>> = () => {
  const { language, setLanguage } = useSettingStore();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      paddingRight: theme.contentPaddingLeftRight,
      paddingLeft: theme.contentPaddingLeftRight,
    },
  });

  const handleSetLanguage = (value?: string) => {
    setLanguage(value);
  };

  return (
    <View style={styles.wrapper}>
      <Heading size="md">{i18n.t("preferences")}</Heading>
      <VStack>
        <FormControl>
          <FormControl.Label>{i18n.t("selectLanguage")}</FormControl.Label>
          <Select
            placeholder={i18n.t("language")}
            selectedValue={language}
            onValueChange={(lang) => handleSetLanguage(lang)}
          >
            <Select.Item
              label={i18n.t("systemDefault")}
              value={"systemDefault"}
            />
            {translationKeys.map((translationCode) => (
              <Select.Item
                key={translationCode}
                label={i18n.t(translationCode)}
                value={translationCode}
              />
            ))}
          </Select>
        </FormControl>
      </VStack>

      {/* <DropDown
        list={colorSchemeList}
        value={userPreferenceColorScheme}
        label={i18n.t("theme")}
        mode={"outlined"}
        setValue={(value) => setUserPreferenceColorScheme(value)}
        visible={showColorSchemeDropDown}
        showDropDown={() => setShowColorSchemeDropDown(true)}
        onDismiss={() => setShowColorSchemeDropDown(false)}
        theme={theme}
      /> */}
    </View>
  );
};

export default SettingsScreen;
