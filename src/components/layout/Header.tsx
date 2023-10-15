import { Pressable, Text, View } from "react-native";
import theme from "../../constants/theme";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import MyText from "../MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../../stacks/RootStack";

type Props = {
  backgroundColor?: string;
  title?: string;
  buttonType?: "exit" | "settings";
  rightElement?: React.ReactNode;
};

const Header = ({
  title,
  buttonType,
  rightElement,
  backgroundColor,
}: Props) => {
  const { top } = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigation>();

  const handleButtonAction = () => {
    if (buttonType === "settings") {
      navigation.navigate("Settings");
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
        backgroundColor: backgroundColor || theme.colors.accentBackground,
        paddingTop: top,
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
            style={{ color: theme.colors.textInverse, fontSize: 20 }}
            name={iconName()}
          />
        </Pressable>
        <MyText
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: theme.colors.textInverse,
          }}
        >
          {title ?? moment().format("MMMM DD, YYYY")}
        </MyText>
        {rightElement}
      </View>
    </View>
  );
};

export default Header;
