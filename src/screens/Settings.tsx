import { Platform, View, Alert } from "react-native";
import Text from "../components/MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useTheme from "../contexts/theme";
import Section from "../components/inputs/Section";
import { usePreferences } from "../stores/preferences";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";
import i18n from "../lib/locales";
import InputRowButton from "../components/inputs/InputRowButton";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import * as Sentry from "sentry-expo";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import links from "../constants/links";
import InputRowContainer from "../components/inputs/InputRowContainer";
import PublisherTypeSelector from "../components/PublisherTypeSelector";
import { faBell } from "@fortawesome/free-regular-svg-icons/faBell";
import { faBellSlash } from "@fortawesome/free-solid-svg-icons/faBellSlash";
import { faHeart, faHourglassHalf } from "@fortawesome/free-regular-svg-icons/";
import IconButton from "../components/IconButton";
import {
  faBug,
  faChevronRight,
  faDownload,
  faFileContract,
  faTools,
  faUndo,
} from "@fortawesome/free-solid-svg-icons";

const Settings = () => {
  const theme = useTheme();
  const { set: setPreferences } = usePreferences();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigation>();

  const resetToOnboarding = () => {
    setPreferences({ onboardingComplete: false });
  };

  useEffect(() => {
    const updateNotificationsStatus = async () => {
      const settings = await Notifications.getPermissionsAsync();
      if (!settings.granted) {
        return;
      }
      setNotificationsEnabled(true);
    };
    updateNotificationsStatus();
  }, []);

  const askToTakeToSettings = () => {
    Alert.alert(
      i18n.t("notificationsDisabled"),
      i18n.t("notificationsDisabled_description"),
      [
        {
          text: i18n.t("cancel"),
          style: "cancel",
        },
        {
          text: i18n.t("yes"),
          style: "default",
          onPress: () => Linking.openSettings(),
        },
      ]
    );
  };

  const fetchUpdate = async () => {
    if (__DEV__) {
      return Alert.alert("Cannot update in dev mode.");
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        navigation.navigate("Update");
      }
      Alert.alert(i18n.t("noUpdateAvailable"));
    } catch (error) {
      Alert.alert(
        `${i18n.t("updateViaThe")} ${
          Platform.OS === "android" ? "Play Store" : "App Store"
        }`,
        `${i18n.t("update_error")} ${error}`
      );
      Sentry.Native.captureException(error);
    }
  };

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        backgroundColor: theme.colors.background,
        flexGrow: 1,
        justifyContent: "space-between",
      }}
    >
      <View style={{ gap: 25 }}>
        <Text
          style={{
            marginLeft: 20,
            marginTop: 20,
            fontSize: 16,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {i18n.t("settings")}
        </Text>
        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: "uppercase",
            }}
          >
            {i18n.t("publisher")}
          </Text>
          <Section>
            <InputRowContainer label={i18n.t("status")} lastInSection>
              <View style={{ flex: 1 }}>
                <PublisherTypeSelector />
              </View>
            </InputRowContainer>
          </Section>
        </View>
        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: "uppercase",
            }}
          >
            {i18n.t("app")}
          </Text>
          <Section>
            <InputRowButton
              leftIcon={notificationsEnabled ? faBell : faBellSlash}
              label={
                notificationsEnabled
                  ? i18n.t("pushNotificationsEnabled")
                  : i18n.t("pushNotificationsDisabled")
              }
              onPress={notificationsEnabled ? undefined : askToTakeToSettings}
            >
              {!notificationsEnabled && <IconButton icon={faChevronRight} />}
            </InputRowButton>
            <InputRowButton
              leftIcon={faHourglassHalf}
              label={i18n.t("viewHours")}
              onPress={() => navigation.navigate("Time Reports")}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faUndo}
              label={i18n.t("recoverContacts")}
              onPress={() => navigation.navigate("Recover Contacts")}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faTools}
              label={i18n.t("restartOnboarding")}
              onPress={resetToOnboarding}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faDownload}
              label={i18n.t("checkForUpdate")}
              onPress={fetchUpdate}
              lastInSection
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
          </Section>
        </View>
        <View style={{ gap: 3 }}>
          <Text
            style={{
              marginLeft: 20,
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
              color: theme.colors.textAlt,
              textTransform: "uppercase",
            }}
          >
            {i18n.t("misc")}
          </Text>
          <Section>
            <InputRowButton
              leftIcon={faHeart}
              label={
                Platform.OS === "android"
                  ? i18n.t("rateJWTimeOnPlayStore")
                  : i18n.t("rateJWTimeOnAppStore")
              }
              onPress={() => {
                try {
                  Platform.OS === "android"
                    ? Linking.openURL(links.playStoreReview)
                    : Linking.openURL(links.appStoreReview);
                } catch (error) {
                  Sentry.Native.captureException(error);
                }
              }}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faBug}
              label={i18n.t("bugReport")}
              onPress={async () => {
                const email = "levi.wilkerson@proton.me";
                const subjectText = "Bug Report";
                const bodyText = `App Version: ${Constants.expoConfig?.version}, Device: ${Device.modelName}, OS: ${Device.osVersion}. Please describe your issue in detail: --------------`;
                const subject = encodeURIComponent(subjectText);
                const body = encodeURIComponent(bodyText);
                try {
                  await Linking.openURL(
                    `mailto:${email}?subject=${subject}&body=${body}`
                  );
                } catch (error) {
                  Alert.alert(
                    i18n.t("error"),
                    i18n.t("failedToOpenMailApplication")
                  );
                }
              }}
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
            <InputRowButton
              leftIcon={faFileContract}
              label={i18n.t("privacyPolicy")}
              onPress={() => Linking.openURL(links.privacyPolicy)}
              lastInSection
            >
              <IconButton icon={faChevronRight} />
            </InputRowButton>
          </Section>
        </View>
      </View>
      <View>
        <Text
          style={{
            textAlign: "center",
            color: theme.colors.textAlt,
            fontFamily: "Inter_600SemiBold",
            marginBottom: 5,
            fontSize: 14,
          }}
        >
          {Constants.expoConfig?.version
            ? `v${Constants.expoConfig?.version}`
            : i18n.t("versionUnknown")}
        </Text>
      </View>
    </View>
  );
};

export default Settings;
