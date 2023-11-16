import { PropsWithChildren } from "react";
import { Text as ReactNativeText, TextProps } from "react-native";
import useTheme from "../contexts/theme";
interface Props extends TextProps {}

const Text: React.FC<PropsWithChildren<Props>> = ({
  children,
  style,
  ...props
}) => {
  const theme = useTheme();

  return (
    <ReactNativeText
      {...props}
      style={[
        [{ color: theme.colors.text, fontFamily: theme.fonts.regular }],
        [style],
      ]}
    >
      {children}
    </ReactNativeText>
  );
};

export default Text;
