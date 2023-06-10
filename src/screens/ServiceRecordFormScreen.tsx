import {
  Icon,
  Layout,
  Text,
  TopNavigation,
  TopNavigationAction,
  useStyleSheet,
} from "@ui-kitten/components";
import React from "react";
import appTheme from "../lib/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ImageProps, StyleSheet, View } from "react-native";
import { TouchableWebElement } from "@ui-kitten/components/devsupport";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { HomeStackParamList } from "../stacks/ParamLists";
import { i18n } from "../lib/translations";
import useServiceRecordStore from "../stores/ServiceRecord";

const DownArrowIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name={"arrow-down"} />;

type ServiceRecordFormProps = NativeStackScreenProps<
  HomeStackParamList,
  "ServiceRecordForm"
>;

const ServiceRecordFormScreen = ({ navigation }: ServiceRecordFormProps) => {
  const insets = useSafeAreaInsets();
  const { setRecord } = useServiceRecordStore();

  const themedStyles = StyleSheet.create({
    wrapper: {
      flex: 1,
      paddingTop: 10,
      gap: 10,
      paddingLeft: appTheme.contentPaddingLeftRight,
      paddingRight: appTheme.contentPaddingLeftRight,
      paddingBottom: insets.bottom + 10,
    },
  });
  const styles = useStyleSheet(themedStyles);

  const TopNavigationWithBackBottom = (): TouchableWebElement => (
    <TopNavigationAction
      icon={DownArrowIcon}
      onPress={() => navigation.goBack()}
    />
  );

  return (
    <Layout style={styles.wrapper}>
      <TopNavigation
        alignment="center"
        accessoryLeft={TopNavigationWithBackBottom}
        title={i18n.t("newServiceEntry")}
      />
      <View></View>
      <Text>Hello ServiceRecordFormScreen</Text>
    </Layout>
  );
};

export default ServiceRecordFormScreen;
