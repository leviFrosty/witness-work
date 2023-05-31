import { PropsWithChildren } from "react";
import { Text } from "react-native-paper";
import Layout from "../components/Layout";

interface SettingsScreenProps {}

const SettingsScreen: React.FC<PropsWithChildren<SettingsScreenProps>> = () => {
  return (
    <Layout>
      <Text>Welcome to the settings screen</Text>
    </Layout>
  );
};

export default SettingsScreen;
