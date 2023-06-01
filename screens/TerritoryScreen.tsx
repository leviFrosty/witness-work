import React, { FC } from "react";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import theme from "../lib/theme";

const TerritoryScreen: FC = () => {
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top + 10,
      paddingRight: theme.contentPaddingLeftRight,
      paddingLeft: theme.contentPaddingLeftRight,
    },
  });

  return (
    <View style={styles.wrapper}>
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <ScreenTitle title={i18n.t("territory")} />
        <Text>Hello</Text>
      </View>
    </View>
  );
};

export default TerritoryScreen;
