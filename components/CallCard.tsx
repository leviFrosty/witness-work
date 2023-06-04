import {
  Box,
  Divider,
  HStack,
  Heading,
  Menu,
  Pressable,
  Text,
  VStack,
  useTheme,
} from "native-base";
import React, { useContext } from "react";
import { Call } from "../stores/CallStore";
import { StyleSheet } from "react-native";
import { i18n } from "../lib/translations";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContext } from "@react-navigation/native";
import appTheme from "../lib/theme";

interface CallCardProps {
  call: Call;
}

const CallCard: React.FC<CallCardProps> = ({ call }) => {
  const navigation = useContext(NavigationContext);
  const theme = useTheme();
  const styles = StyleSheet.create({
    container: {
      backgroundColor: "teal",
      padding: 5,
      borderRadius: appTheme.borderRadius,
    },
    pressable: { marginTop: 10 },
  });

  return (
    <Pressable
      style={styles.pressable}
      onPress={() => navigation?.navigate("CallDetails", { id: call.id })}
    >
      <Box style={styles.container}>
        <HStack>
          <VStack style={{ flex: 1 }}>
            <Heading size="sm">{call.name}</Heading>
            {call.interestLevel && <Text>{i18n.t(call.interestLevel)}</Text>}
          </VStack>
          <VStack style={{ flex: 1 }}>
            <Text>$Next Visit Goes Here$</Text>
            <Text fontSize={"xs"} color={theme.colors.dark[600]}>
              Next Visit
            </Text>
            <Text>$Previous Visit Goes Here$</Text>
            <Text fontSize={"xs"} color={theme.colors.dark[600]}>
              Last Visit
            </Text>
          </VStack>
          <VStack>
            <Menu
              w="190"
              trigger={(triggerProps) => {
                return (
                  <Pressable {...triggerProps}>
                    <MaterialCommunityIcons
                      name="dots-horizontal"
                      size={25}
                      color={theme.colors.white}
                    />
                  </Pressable>
                );
              }}
            >
              <Menu.Group title="View">
                <Menu.Item>Open</Menu.Item>
              </Menu.Group>
              <Divider w="100%" mt="3" />
              <Menu.Group title="Actions">
                <Menu.Item>Add Visit</Menu.Item>
                <Menu.Item>Edit</Menu.Item>
              </Menu.Group>
            </Menu>
          </VStack>
        </HStack>
      </Box>
    </Pressable>
  );
};

export default CallCard;
