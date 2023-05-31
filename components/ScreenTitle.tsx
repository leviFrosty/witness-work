import React, { PropsWithChildren } from "react";
import { Text } from "react-native-paper";
import { StyleSheet } from "react-native";

interface Props {}

const styles = StyleSheet.create({
  title: {
    fontSize: 40,
  },
});

const ScreenTitle: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  return <Text style={styles.title}>{children}</Text>;
};

export default ScreenTitle;
