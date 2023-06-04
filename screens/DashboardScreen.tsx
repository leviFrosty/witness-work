import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";
import ScreenTitle from "../components/ScreenTitle";
import { i18n } from "../lib/translations";
import appTheme from "../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Fab,
  FlatList,
  Heading,
  Input,
  Skeleton,
  Text,
  useTheme,
} from "native-base";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import useCallsStore from "../stores/CallStore";
import CallCard from "../components/CallCard";
import { HomeStackParamList } from "../stacks/ParamLists";

type HomeProps = NativeStackScreenProps<HomeStackParamList, "Dashboard">;

export type Sheet = {
  isOpen: boolean;
  hasSaved: boolean;
};

const DashboardScreen = ({ navigation }: HomeProps) => {
  const { calls } = useCallsStore();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top + 25,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
    fab: {
      position: "absolute",
      paddingBottom: 90,
      paddingRight: 10,
    },
    input: {
      paddingLeft: 15,
      paddingRight: 15,
    },
  });

  return (
    <View style={styles.wrapper}>
      <ScreenTitle
        title={i18n.t("dashboard")}
        icon={
          <MaterialCommunityIcons
            name="cog"
            color={theme.colors.white}
            size={30}
            onPress={() => navigation.navigate("Settings")}
          />
        }
      />
      <Text my="5">Weekly routine goes here...</Text>
      <Heading>{i18n.t("monthlyTotals")}</Heading>
      <Text my="12">Monthly totals goes here...</Text>
      <Heading mb="4">Calls</Heading>
      <Input
        size="xl"
        style={styles.input}
        placeholder="Search for a call..."
        variant="filled"
        InputRightElement={
          <MaterialCommunityIcons
            name="magnify"
            color={theme.colors.white}
            size={20}
            style={{ marginRight: 10 }}
          />
        }
      />
      <FlatList
        data={calls}
        renderItem={({ item }) => <CallCard call={item} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Skeleton h={5} />}
      />
      <Fab
        renderInPortal={false}
        padding="3"
        icon={
          <MaterialCommunityIcons
            name="plus"
            color={theme.colors.white}
            size={25}
          />
        }
        onPress={() => navigation.navigate("CallForm")}
      />
    </View>
  );
};

export default DashboardScreen;
