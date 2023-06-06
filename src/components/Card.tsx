import { StyleSheet, View } from "react-native";
import appTheme from "../lib/theme";
import { useStyleSheet } from "@ui-kitten/components";
import { PropsWithChildren } from "react";

interface CardProps {}

const Card: React.FC<PropsWithChildren<CardProps>> = ({
  children,
  ...props
}) => {
  const themedStyles = StyleSheet.create({
    container: {
      position: "relative",
      paddingVertical: 10,
      paddingHorizontal: 20,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "color-primary-transparent-100",
      borderStyle: "solid",
      borderWidth: 1,
      borderColor: "color-primary-default-border",
      borderRadius: appTheme.borderRadius,
    },
  });
  const styles = useStyleSheet(themedStyles);

  return (
    <View style={styles.container} {...props}>
      {children}
    </View>
  );
};

export default Card;
