import { Pressable, Text, View } from "react-native";
import theme from "../../constants/theme";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import MyText from "../MyText";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const Header = ({ title }: { title?: string }) => {
  const { top } = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: theme.colors.accentBackground,
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
          paddingVertical: 10,
        }}
      >
        <Pressable
          style={{ position: "absolute", left: 0 }}
          hitSlop={15}
          onPress={() => console.log("Navigating to settings...")}
        >
          <FontAwesome
            style={{ color: theme.colors.textInverse, fontSize: 20 }}
            name="cog"
          />
        </Pressable>
        <MyText
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: theme.colors.textInverse,
          }}
        >
          {title || moment().format("MMMM DD, YYYY")}
        </MyText>
      </View>
    </View>
  );
};

export default Header;
