import { DimensionValue, View } from "react-native";
import useTheme from "../contexts/theme";

const Divider = ({
  marginVertical,
  marginHorizontal,
  borderWidth,
  borderStyle,
  vertical,
}: {
  marginHorizontal?: DimensionValue;
  marginVertical?: DimensionValue;
  borderStyle?: "solid" | "dotted" | "dashed" | undefined;
  borderWidth?: number;
  vertical?: boolean;
}) => {
  const theme = useTheme();

  return (
    <View
      style={{
        width: vertical ? 1 : "100%",
        height: vertical ? "100%" : 1,
        borderColor: theme.colors.border,
        borderWidth: borderWidth ? 1 : undefined,
        borderTopWidth: !borderStyle ? 1 : undefined,
        borderLeftWidth: vertical ? 1 : undefined,
        borderStyle,
        marginVertical,
        marginHorizontal,
      }}
    />
  );
};

export default Divider;
