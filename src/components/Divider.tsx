import { DimensionValue, View } from "react-native";
import theme from "../constants/theme";

const Divider = ({
  margin,
  borderStyle,
}: {
  margin?: DimensionValue;
  borderStyle?: "solid" | "dotted" | "dashed" | undefined;
}) => {
  return (
    <View
      style={{
        width: "100%",
        height: 1,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderStyle,
        margin,
      }}
    />
  );
};

export default Divider;
