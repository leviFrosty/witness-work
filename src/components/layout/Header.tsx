import { Platform, View } from "react-native";
import useTheme from "../../contexts/theme";
import moment from "moment";
import Text from "../MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../../stacks/RootStack";
import IconButton from "../IconButton";
import {
  faBars,
  faChevronLeft,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";

type Props = {
  backgroundColor?: string;
  inverseTextAndIconColor?: boolean;
  title?: string;
  buttonType?: "exit" | "settings" | "back";
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
    if (buttonType === "back") {
      navigation.goBack();
    }
  };

  const iconName = (): IconProp => {
    if (buttonType === "settings") {
      return faBars;
    }
    if (buttonType === "exit") {
      return faTimes;
    }
    if (buttonType === "back") {
      return faChevronLeft;
    }
    return faBars;
  };

  return (
    <View
      style={{
        backgroundColor: backgroundColor || theme.colors.background,
        paddingTop: noInsets && Platform.OS === "ios" ? 10 : insets.top,
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
        <IconButton
          style={{ position: "absolute", left: 0 }}
          onPress={handleButtonAction}
          icon={iconName()}
          iconStyle={{
            color: inverseTextAndIconColor
              ? theme.colors.textInverse
              : theme.colors.text,
          }}
          size={"xl"}
        />
        <Text
          style={{
            fontSize: 18,
            fontFamily: theme.fonts.semiBold,
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
