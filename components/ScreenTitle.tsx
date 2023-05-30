import React, { PropsWithChildren } from "react";
import { Title } from "react-native-paper";
import { StyleSheet } from "react-native";

interface Props {}

const styles = StyleSheet.create({
  title: {
    fontSize: 40,
  },
});

const ScreenTitle: React.FC<PropsWithChildren<Props>> = ({ children }) => {
  return <Title style={styles.title}>{children}</Title>;
};

export default ScreenTitle;
