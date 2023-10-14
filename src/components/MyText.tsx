import { PropsWithChildren } from "react";
import { Text, StyleProp, TextStyle, TextProps } from "react-native";
import theme from "../constants/theme";

const MyText: React.FC<PropsWithChildren<TextProps>> = ({
  children,
  style,
  ...props
}) => {
  return (
    <Text {...props} style={[[{ color: theme.colors.text }], [style]]}>
      {children}
    </Text>
  );
};

export default MyText;
