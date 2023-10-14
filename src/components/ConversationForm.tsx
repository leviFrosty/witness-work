import { View } from "react-native";
import MyText from "./MyText";
import * as Crypto from "expo-crypto";

const ConversationForm = () => {
  const convoId = Crypto.randomUUID();

  return (
    <View>
      <MyText>Conversation</MyText>
    </View>
  );
};

export default ConversationForm;
