import { Heading, Text } from "native-base";
import { ThemeComponentSizeType } from "native-base/lib/typescript/components/types";
import React, { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

interface ScreenTitleProps {
  title: string;
  size?: ThemeComponentSizeType<"Heading">;
  icon?: ReactNode;
}

const ScreenTitle: React.FC<ScreenTitleProps> = ({ title, size, icon }) => {
  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 10,
    },
  });

  return (
    <View style={styles.container}>
      <Heading size={size || "2xl"}>{title}</Heading>
      {icon}
    </View>
  );
};

export default ScreenTitle;
