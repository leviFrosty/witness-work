import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import { View } from "react-native";
import { Text } from "react-native-paper";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../translations";
import { getLocales } from "expo-localization";

type HomeProps = NativeStackScreenProps<RootStackParamList, "Home">;

const HomeScreen = ({ navigation }: HomeProps) => {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ScreenTitle>
        {i18n.t("dashboard")} {i18n.t("home")} {i18n.t("returnVisits")}
      </ScreenTitle>
      <Text>Current locale: {i18n.locale}</Text>
      <Text>Device locale: {getLocales()[0].languageCode}</Text>
    </View>
  );
};

export default HomeScreen;
