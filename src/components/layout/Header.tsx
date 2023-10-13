import { Pressable, Text, View } from "react-native";
import theme from "../../constants/theme";
import moment from "moment";
import { FontAwesome } from "@expo/vector-icons";

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
          style={{ color: theme.colors.text, fontSize: 20 }}
          name="cog"
        />
      </Pressable>
      <Text
        style={{ fontSize: 18, fontWeight: "600", color: theme.colors.text }}
      >
        {title || moment().format("MMMM DD, YYYY")}
      </Text>
    </View>
  );
};

export default Header;
