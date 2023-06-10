import { Button, Icon, Text } from "@ui-kitten/components";
import React from "react";
import { ImageProps, StyleSheet, View } from "react-native";

interface ScreenTitleProps {
  title: string;
  category?: string;
  icon?: string;
  onIconPress?: () => void;
  status?: string;
}

const ScreenTitle: React.FC<ScreenTitleProps> = ({
  title,
  category,
  icon,
  onIconPress,
  status,
}) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
  });

  const SelectedIcon = (
    props?: Partial<ImageProps>
  ): React.ReactElement<ImageProps> => (
    <Icon {...props} name={icon || "help"} />
  );

  return (
    <View style={styles.container}>
      <Text category={category || "h1"} status={status || "basic"}>
        {title}
      </Text>
      {icon && (
        <Button
          appearance="ghost"
          accessoryLeft={SelectedIcon}
          onPress={onIconPress}
        />
      )}
    </View>
  );
};

export default ScreenTitle;
