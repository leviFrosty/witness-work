import React, { ReactNode } from "react";
import { Text, useTheme } from "react-native-paper";
import { StyleSheet, View } from "react-native";

interface ScreenTitleProps {
  title: string;
  icon?: ReactNode;
}

const ScreenTitle: React.FC<ScreenTitleProps> = ({ title, icon }) => {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingBottom: 10,
    },
    title: {
      fontSize: 40,
      color: theme.colors.secondary,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {icon}
    </View>
  );
};

export default ScreenTitle;
