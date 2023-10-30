import { PropsWithChildren } from "react";
import { Text as ReactNativeText, TextProps } from "react-native";
import theme from "../constants/theme";

const Text: React.FC<PropsWithChildren<TextProps>> = ({
  children,
  style,
  ...props
}) => {
  return (
    <ReactNativeText
      {...props}
      style={[
        [{ color: theme.colors.text, fontFamily: "Inter_400Regular" }],
        [style],
      ]}
    >
      {children}
    </ReactNativeText>
  );
};

export default Text;
