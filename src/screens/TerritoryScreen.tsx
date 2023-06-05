import React, { FC } from "react";
import ScreenTitle from "../components/ScreenTitle";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appTheme from "../lib/theme";
import { i18n } from "../lib/translations";
import { Layout, Text } from "@ui-kitten/components";

const TerritoryScreen: FC = () => {
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      justifyContent: "space-between",
      paddingTop: insets.top + 20,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
  });

  return (
    <Layout style={styles.wrapper}>
      <ScreenTitle title={i18n.t("territory")} />
      <Text>Hello</Text>
    </Layout>
  );
};

export default TerritoryScreen;
