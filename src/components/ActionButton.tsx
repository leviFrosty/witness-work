import { TouchableHighlight } from "react-native";
import Text from "./MyText";
import useTheme from "../contexts/theme";

interface Props {
  action: () => unknown;
  label: string;
  disabled?: boolean;
}

const ActionButton = ({ action, label, disabled }: Props) => {
  const theme = useTheme();
  return (
    <TouchableHighlight
      style={{
        backgroundColor: disabled
          ? theme.colors.accentAlt
          : theme.colors.accent,
        borderRadius: 15,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
      onPress={action}
      disabled={disabled}
    >
      <Text
        style={{
          fontSize: 24,
          color: theme.colors.textInverse,
          fontFamily: "Inter_700Bold",
        }}
      >
        {label}
      </Text>
    </TouchableHighlight>
  );
};

export default ActionButton;
