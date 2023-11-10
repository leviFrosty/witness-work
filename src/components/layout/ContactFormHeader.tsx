import { Pressable, View } from "react-native";
import { FontAwesome } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useTheme from "../../contexts/theme";
import { useNavigation } from "@react-navigation/native";
import { RootStackNavigation } from "../../stacks/RootStack";

const ContactFormHeader = () => {
  const theme = useTheme();
  const navigation = useNavigation<RootStackNavigation>();
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
          backgroundColor: "orange",
        }}
      >
        <View>
          <Pressable
            style={{ position: "absolute", left: 0 }}
            hitSlop={15}
            onPress={() => navigation.popToTop()}
          >
            <FontAwesome
              style={{ color: theme.colors.textInverse, fontSize: 20 }}
              name="times"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default ContactFormHeader;
