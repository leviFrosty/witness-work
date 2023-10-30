import { TouchableOpacity } from "react-native";
import Text from "./MyText";
import theme from "../constants/theme";

interface Props {
  action: () => unknown;
  label: string;
}

const ActionButton = ({ action, label }: Props) => {
  return (
    <TouchableOpacity
      style={{
        backgroundColor: theme.colors.accent,
        borderRadius: 15,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
      onPress={action}
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
    </TouchableOpacity>
  );
};

export default ActionButton;
