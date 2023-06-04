import React from "react";
import ScreenTitle from "./ScreenTitle";
import { i18n } from "../lib/translations";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, View } from "react-native";
import appTheme from "../lib/theme";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import { Text } from "@ui-kitten/components";

type CallDetailsProps = NativeStackScreenProps<
  HomeStackParamList,
  "CallDetails"
>;

const CallDetailsScreen = ({ route }: CallDetailsProps) => {
  const callId = route.params.id;
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    wrapper: {
      paddingTop: insets.top + 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
    },
  });

  return (
    <View style={styles.wrapper}>
      <ScreenTitle title={i18n.t("callDetails")} />
      <Text>{callId}</Text>
    </View>
  );
};

export default CallDetailsScreen;
