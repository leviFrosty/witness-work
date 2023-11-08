import { View, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LottieView from "lottie-react-native";
import Text from "../components/MyText";
import { useEffect, useRef, useState } from "react";
import theme from "../constants/theme";
import i18n from "../lib/locales";
import * as Updates from "expo-updates";
import * as Sentry from "sentry-expo";
import ActionButton from "../components/ActionButton";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../stacks/RootStack";

const Update = () => {
  const insets = useSafeAreaInsets();
  const loadingAnimation = useRef<LottieView>(null);
  const errorAnimation = useRef<LottieView>(null);
  const [error, setError] = useState<unknown>();
  const [viewError, setViewError] = useState(false);
  const [isLoadingSlowly, setIsLoadingSlowly] = useState(false);
  const navigation = useNavigation<RootStackNavigation>();

  useEffect(() => {
    const update = async () => {
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch (err) {
        setError(err);
        Sentry.Native.captureException(err);
      }
    };

    update();

    const timeout = setTimeout(() => setIsLoadingSlowly(true), 10000);
    return () => clearTimeout(timeout);
  }, [navigation]);

  return (
    <View
      style={{
        marginTop: insets.top,
        marginBottom: insets.bottom,
        flexGrow: 1,
        padding: 30,
      }}
    >
      {!error ? (
        <View
          style={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <LottieView
            onLayout={() => loadingAnimation.current?.play()}
            loop={true}
            ref={loadingAnimation}
            style={{
              width: "100%",
            }}
            source={require("./../assets/lottie/loading.json")}
          />
          {isLoadingSlowly && (
            <View style={{ gap: 10 }}>
              <Text>{i18n.t("loadingSlowly")}</Text>
              <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
                {i18n.t("loadingSlowly_description")}
              </Text>
              <TouchableOpacity>
                <Text
                  onPress={() => navigation.replace("Home")}
                  style={{ fontSize: 14, textDecorationLine: "underline" }}
                >
                  {i18n.t("cancel")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View
          style={{
            flexGrow: 1,
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "center" }}>
              <LottieView
                onLayout={() => errorAnimation.current?.play()}
                loop={true}
                ref={errorAnimation}
                style={{
                  width: "50%",
                }}
                source={require("./../assets/lottie/error.json")}
              />
            </View>
            <Text style={{ fontSize: 40, fontFamily: "Inter_700Bold" }}>
              {i18n.t("thereWasAnErrorWithYourUpdate")}
            </Text>
            {viewError ? (
              <ScrollView style={{ maxHeight: 150 }}>
                <Text style={{ color: theme.colors.textAlt }}>
                  {JSON.stringify(error, null, 2)}
                </Text>
              </ScrollView>
            ) : (
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textAlt,
                  fontFamily: "Inter_700Bold",
                  textDecorationLine: "underline",
                }}
                onPress={() => setViewError(true)}
              >
                {i18n.t("viewError")}
              </Text>
            )}
          </View>
          <ActionButton
            action={() => navigation.replace("Home")}
            label={i18n.t("goHome")}
          />
        </View>
      )}
    </View>
  );
};
export default Update;
