import { View, ViewStyle } from "react-native";
import { useContext } from "react";
import { ThemeContext } from "../../contexts/theme";
import Text from "../MyText";
import i18n from "../../lib/locales";
import IconButton from "../IconButton";
import { faTrash } from "@fortawesome/free-solid-svg-icons";
import { ThemeSizes } from "../../types/theme";

const SwipeableDelete = ({
  size,
  noText,
  style,
}: {
  size?: ThemeSizes;
  noText?: boolean;
  style?: ViewStyle;
}) => {
  const theme = useContext(ThemeContext);

  return (
    <View
      style={[
        [
          {
            paddingHorizontal: 20,
            gap: 5,
            alignItems: "center",
            justifyContent: "center",
          },
        ],
        [style],
      ]}
    >
      <IconButton icon={faTrash} size={size || "lg"} />
      {!noText && (
        <Text style={{ color: theme.colors.textAlt }}>{i18n.t("delete")}</Text>
      )}
    </View>
  );
};
export default SwipeableDelete;
