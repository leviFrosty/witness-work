import React, { useContext, useState } from "react";
import { Call } from "../stores/CallStore";
import { ImageProps, Pressable, StyleSheet, View } from "react-native";
import { i18n } from "../lib/translations";
import { NavigationContext } from "@react-navigation/native";
import appTheme from "../lib/theme";
import {
  Button,
  Divider,
  Icon,
  Layout,
  Popover,
  Text,
} from "@ui-kitten/components";

interface CallCardProps {
  call: Call;
}

const DotsIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="dots-horizontal" />;

const CallCard: React.FC<CallCardProps> = ({ call }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigation = useContext(NavigationContext);
  const styles = StyleSheet.create({
    container: {
      backgroundColor: "teal",
      height: 100,
      padding: 5,
      borderRadius: appTheme.borderRadius,
    },
    pressable: {},
  });

  const renderMenuToggleButton = () => {
    return (
      <Button onPress={() => setIsMenuOpen(true)}>
        <DotsIcon />
      </Button>
    );
  };

  return (
    <Pressable
      style={styles.pressable}
      onPress={() => navigation?.navigate("CallDetails", { id: call.id })}
    >
      <Layout level="2" style={styles.container}>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View
            style={{
              flexDirection: "column",
              alignItems: "center",
              width: "30%",
            }}
          >
            <Text category="h5">{call.name}</Text>
            {call.interestLevel && <Text>{i18n.t(call.interestLevel)}</Text>}
          </View>
          <View style={{ flex: 1, flexDirection: "column" }}>
            <Text>$Next Visit Goes Here$</Text>
            <Text category="s2" appearance="hint">
              Next Visit
            </Text>
            <Text>$Previous Visit Goes Here$</Text>
            <Text category="s2" appearance="hint">
              Last Visit
            </Text>
          </View>
          <View style={{ flex: 1, flexDirection: "column" }}>
            <Popover
              visible={isMenuOpen}
              anchor={renderMenuToggleButton}
              onBackdropPress={() => setIsMenuOpen(false)}
            >
              <View style={{ flex: 1, flexDirection: "column" }}>
                <Text>Open</Text>
                <Divider />
                <Text>Add Visit</Text>
                <Text>Edit</Text>
              </View>
            </Popover>
          </View>
        </View>
      </Layout>
    </Pressable>
  );
};

export default CallCard;
