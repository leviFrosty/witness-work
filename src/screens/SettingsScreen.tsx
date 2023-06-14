import { PropsWithChildren, useEffect, useState } from "react";
import { i18n, translationKeys } from "../lib/translations";
// import useSettingStore from "../stores/SettingsStore";
import { ImageProps, Keyboard, StyleSheet, View } from "react-native";
import appTheme from "../lib/theme";
import {
  Icon,
  IndexPath,
  Input,
  Layout,
  Select,
  SelectItem,
  Text,
} from "@ui-kitten/components";
import useSettingStore, {
  PublisherType,
  publisherTypeHasAnnualRequirement,
  publisherTypes,
} from "../stores/SettingsStore";
import TopNavBarWithBackButton from "../components/TopNavBarWithBackButton";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TouchableWithoutFeedback } from "@ui-kitten/components/devsupport";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { PublisherTypeIcon, TargetIcon } from "../components/Icons";

interface SettingsScreenProps {}

const TranslationIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="translate" />;

const SettingsScreen: React.FC<PropsWithChildren<SettingsScreenProps>> = () => {
  const { language, setLanguage, user, setUser } = useSettingStore();
  const [languageIndex, setLanguageIndex] = useState<IndexPath | IndexPath[]>(
    new IndexPath(translationKeys.indexOf(language || i18n.locale))
  );
  const [publisherTypeIndex, setPublisherTypeIndex] = useState<
    IndexPath | IndexPath[]
  >(new IndexPath(publisherTypes.indexOf(user.publisherType)));
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const setPublisherTypeWithHourTarget = (
      publisherType: PublisherType,
      monthlyTargetHours?: number
    ) => {
      // Don't override existing hours if set
      if (!user.monthlyTargetHours && monthlyTargetHours) {
        setUser({ ...user, publisherType, monthlyTargetHours });
      } else {
        setUser({ ...user, publisherType });
      }
    };
    // @ts-ignore
    const publisherType = publisherTypes[publisherTypeIndex.row];
    switch (publisherType) {
      case "auxiliaryPioneer":
        setPublisherTypeWithHourTarget(publisherType, 30);
        break;
      case "circuitOverseer": {
        setPublisherTypeWithHourTarget(publisherType, 50);
        break;
      }
      case "regularPioneer": {
        setPublisherTypeWithHourTarget(publisherType, 50);
        break;
      }
      case "specialPioneer": {
        setPublisherTypeWithHourTarget(publisherType, 90);
        break;
      }
      default:
        setPublisherTypeWithHourTarget(publisherType);
    }
    // @ts-ignore
  }, [publisherTypeIndex]);

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

  return (
    <Layout style={styles.wrapper}>
      <TopNavBarWithBackButton title={i18n.t("settings")} />
      <KeyboardAwareScrollView>
        <TouchableWithoutFeedback
          style={{ flex: 1 }}
          onPress={Keyboard.dismiss}
        >
          <View style={{ gap: 10 }}>
            <View style={{ gap: 10 }}>
              <Text category="s1">{i18n.t("preferences")}</Text>
              <Select
                accessoryLeft={TranslationIcon}
                label={(evaProps) => (
                  <Text {...evaProps}>{i18n.t("language")}</Text>
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
            </View>

            <View style={{ gap: 10 }}>
              <Text category="s1">{i18n.t("personalDetails")}</Text>
              <Select
                label={i18n.t("publisherType")}
                accessoryLeft={PublisherTypeIcon}
                // @ts-ignore
                value={i18n.t(publisherTypes[publisherTypeIndex.row])}
                selectedIndex={publisherTypeIndex}
                caption={i18n.t("publisherTypeCaption")}
                onSelect={(index) => setPublisherTypeIndex(index)}
              >
                {publisherTypes.map((publisherType) => (
                  <SelectItem
                    key={publisherType}
                    title={() => <Text>{i18n.t(publisherType)}</Text>}
                  />
                ))}
              </Select>
              <View style={{ flexDirection: "row", gap: 5 }}>
                <Input
                  style={{ flex: 1 }}
                  accessoryLeft={TargetIcon}
                  label={i18n.t("monthlyHourTarget")}
                  keyboardType="number-pad"
                  value={user.monthlyTargetHours?.toString() || "0"}
                  onChangeText={(numberString) => {
                    let number: number;
                    if (Number.isNaN(parseInt(numberString))) {
                      number = 0;
                    } else {
                      number = parseInt(numberString);
                    }
                    if (number < 0) {
                      number = 0;
                    }
                    setUser({
                      ...user,
                      monthlyTargetHours: number,
                    });
                  }}
                />
                {publisherTypeHasAnnualRequirement(user.publisherType) &&
                  user.monthlyTargetHours !== undefined && (
                    <View style={{ flex: 1, gap: 10 }}>
                      <Text category="c2" appearance="hint">
                        {i18n.t("annualHourTarget")}
                      </Text>
                      <Text style={{ paddingHorizontal: 10 }} category="h6">
                        {user.monthlyTargetHours * 12}
                      </Text>
                    </View>
                  )}
              </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAwareScrollView>
    </Layout>
  );
};

export default SettingsScreen;
