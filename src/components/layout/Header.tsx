import { Pressable, Text, View } from "react-native";
import theme from "../../constants/theme";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";
import MyText from "../MyText";

const Header = ({ title }: { title?: string }) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
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
  );
};

export default Header;
