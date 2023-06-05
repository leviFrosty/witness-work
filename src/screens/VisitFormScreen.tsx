import { i18n } from "../lib/translations";
import { StyleSheet } from "react-native";
import appTheme from "../lib/theme";
import { Layout, Text } from "@ui-kitten/components";
import TopNavBarWithBackButton from "../components/TopNavBarWithBackButton";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";

type VisitFormScreenProps = NativeStackScreenProps<
  HomeStackParamList,
  "VisitForm"
>;

const VisitFormScreen = ({ route }: VisitFormScreenProps) => {
  const callId = route.params.callId;
  const insets = useSafeAreaInsets();
  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: insets.top,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingLeft: appTheme.contentPaddingLeftRight,
    },
  });

  return (
    <Layout style={styles.wrapper}>
      <TopNavBarWithBackButton title={i18n.t("newVisit")} />
      <Text category="s1">{i18n.t("date")}</Text>
    </Layout>
  );
};

export default VisitFormScreen;
