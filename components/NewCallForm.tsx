import React from "react";
import { View, StyleSheet } from "react-native";
import { Text, useTheme } from "react-native-paper";
import theme from "../lib/theme";

type NewCallFormProps = {};

const NewCallForm: React.FC<NewCallFormProps> = () => {
  const paperTheme = useTheme();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: paperTheme.colors.inverseOnSurface,
      paddingTop: 10,
      paddingRight: theme.contentPaddingLeftRight,
      paddingLeft: theme.contentPaddingLeftRight,
    },
    title: {
      fontSize: 30,
      color: paperTheme.colors.secondary,
    },
  });

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>New Call</Text>
    </View>
  );
};

export default NewCallForm;
