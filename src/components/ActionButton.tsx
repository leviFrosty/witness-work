import { TouchableOpacity } from "react-native";
import MyText from "./MyText";
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
      <MyText
        style={{
          fontSize: 24,
          color: theme.colors.textInverse,
          fontWeight: "700",
        }}
      >
        {label}
      </MyText>
    </TouchableOpacity>
  );
};

export default ActionButton;
