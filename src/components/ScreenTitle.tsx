import { Button, Icon, Text } from "@ui-kitten/components";
import React from "react";
import { ImageProps, StyleSheet, View } from "react-native";

interface ScreenTitleProps {
  title: string;
  category?: string;
  icon?: string;
  onIconPress?: () => void;
}

const ScreenTitle: React.FC<ScreenTitleProps> = ({
  title,
  category,
  icon,
  onIconPress,
}) => {
  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingBottom: 10,
    },
  });

  const SelectedIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => (
    <Icon {...props} name={icon || "help"} />
  );

  return (
    <View style={styles.container}>
      <Text category={category || "h1"}>{title}</Text>
      <Button accessoryLeft={SelectedIcon} onPress={onIconPress} />
    </View>
  );
};

export default ScreenTitle;
