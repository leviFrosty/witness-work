import { Pressable, View } from "react-native";
import useTheme from "../../contexts/theme";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import Text from "../MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../../stacks/RootStack";

type Props = {
  backgroundColor?: string;
  inverseTextAndIconColor?: boolean;
  title?: string;
  buttonType?: "exit" | "settings";
  onPressLeftIcon?: () => void;
  rightElement?: React.ReactNode;
  noBottomBorder?: boolean;
  noInsets?: boolean;
};

const Header = ({
  title,
  buttonType,
  rightElement,
  backgroundColor,
  inverseTextAndIconColor,
  noBottomBorder,
  noInsets,
  onPressLeftIcon,
}: Props) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigation>();

  const handleButtonAction = () => {
    if (onPressLeftIcon) {
      return onPressLeftIcon();
    }
    if (buttonType === "exit") {
      navigation.popToTop();
    }
  };

  const iconName = () => {
    if (buttonType === "settings") {
      return "cog";
    }
    if (buttonType === "exit") {
      return "times";
    }
    return "cog";
  };

  return (
    <View
      style={{
        backgroundColor: backgroundColor || theme.colors.background,
        paddingTop: noInsets ? 10 : insets.top,
        borderBottomWidth: noBottomBorder ? 0 : 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <View
        style={{
          position: "relative",
          flexGrow: 1,
          marginHorizontal: 15,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
        }}
      >
        <Pressable
          style={{ position: "absolute", left: 0 }}
          hitSlop={15}
          onPress={handleButtonAction}
        >
          <FontAwesome
            style={{
              color: inverseTextAndIconColor
                ? theme.colors.textInverse
                : theme.colors.text,
              fontSize: 20,
            }}
            name={iconName()}
          />
        </Pressable>
        <Text
          style={{
            fontSize: 18,
            fontFamily: "Inter_600SemiBold",
            color: inverseTextAndIconColor
              ? theme.colors.textInverse
              : theme.colors.text,
          }}
        >
          {title ?? moment().format("LL")}
        </Text>
        {rightElement}
      </View>
    </View>
  );
};

export default Header;
