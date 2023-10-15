import { View, TouchableOpacity } from "react-native";
import MyText from "./MyText";
import theme from "../constants/theme";
import Card from "./Card";
import { FontAwesome } from "@expo/vector-icons";
import { Contact } from "../types/contact";

const ContactRow = ({
  contact,
  onPress,
}: {
  contact: Contact;
  onPress?: () => void;
}) => {
  const { name, isBibleStudy } = contact;

  return (
    <TouchableOpacity onPress={onPress}>
      <Card
        style={{
          backgroundColor: theme.colors.backgroundLighter,
          alignItems: "center",
        }}
        flexDirection="row"
      >
        <View style={{ flexGrow: 1, gap: 2 }}>
          <MyText style={{ fontSize: 18 }}>{name}</MyText>
          <MyText style={{ color: theme.colors.textAlt, fontSize: 10 }}>
            2 Weeks Ago
          </MyText>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {isBibleStudy && (
            <FontAwesome
              style={{ color: theme.colors.text, fontSize: 15 }}
              name="book"
            />
          )}
          <FontAwesome
            style={{ color: theme.colors.textAlt, fontSize: 15 }}
            name="chevron-right"
          />
        </View>
      </Card>
    </TouchableOpacity>
  );
};

export default ContactRow;
