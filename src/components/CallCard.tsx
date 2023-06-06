import React, { useContext, useMemo, useState } from "react";
import { Call } from "../stores/CallStore";
import { ImageProps, Pressable, StyleSheet, View } from "react-native";
import { capitalizeEachWordInSentence, i18n } from "../lib/translations";
import { NavigationContext } from "@react-navigation/native";
import appTheme from "../lib/theme";
import {
  Button,
  Icon,
  IconElement,
  Layout,
  MenuItem,
  OverflowMenu,
  Text,
  useStyleSheet,
} from "@ui-kitten/components";
import { openLinkToCoordinatesOrAddress } from "../screens/CallDetailsScreen";
import * as Haptics from "expo-haptics";
import useVisitsStore from "../stores/VisitStore";
import moment from "moment";

interface CallCardProps {
  call: Call;
}

const DotsIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="dots-horizontal" />;

const MapMarkerIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="map-marker" />;

const EditIcon = (
  props?: Partial<ImageProps>
): React.ReactElement<ImageProps> => <Icon {...props} name="pencil" />;

const CallCard: React.FC<CallCardProps> = ({ call }) => {
  const navigation = useContext(NavigationContext);
  const themedStyles = StyleSheet.create({
    container: {
      height: 70,
      paddingHorizontal: 20,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "color-primary-transparent-100",
      borderStyle: "solid",
      borderWidth: 1,
      borderColor: "color-primary-default-border",
      borderRadius: appTheme.borderRadius,
    },
    pressable: {},
    chevronRight: { height: 20, width: 20, color: "color-basic-default" },
  });
  const styles = useStyleSheet(themedStyles);
  const { visits } = useVisitsStore();
  const callVisits = visits.filter((v) => v.call.id === call.id);

  const ChevronRight = (): IconElement => (
    <Icon style={styles.chevronRight} name={"chevron-right"} />
  );

  const timeSinceLastVisit = useMemo(() => {
    const mostRecentVisitMoment = callVisits
      ?.filter((v) => v.call.id === call.id)
      .sort((a, b) => moment(b.date).valueOf() - moment(a.date).valueOf())
      .find((_, index) => index == 0)?.date;
    if (!mostRecentVisitMoment) {
      return "";
    }
    return capitalizeEachWordInSentence(
      moment(mostRecentVisitMoment).fromNow()
    );
  }, [callVisits, call]);

  return (
    <Pressable
      style={styles.pressable}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        navigation?.navigate("CallDetails", { callId: call.id });
      }}
    >
      <Layout level="3" style={styles.container}>
        <View
          style={{
            flex: 1,
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <Text category="h6">{call.name}</Text>
          <Text appearance="hint" category="c1">
            {timeSinceLastVisit}
          </Text>
        </View>
        <ChevronRight />
        {/* <View style={{ flex: 1, flexDirection: "column" }}>
            <OverflowMenu
              onBackdropPress={() => setIsMenuOpen(false)}
              backdropStyle={styles.backdrop}
              anchor={renderMenuToggleButton}
              visible={isMenuOpen}
            >
              {call.address?.line1 || call.address?.coordinates?.latitude ? (
                <MenuItem
                  title={i18n.t("navigateTo")}
                  accessoryLeft={MapMarkerIcon}
                  onPress={() => openLinkToCoordinatesOrAddress(call)}
                />
              ) : (
                <React.Fragment />
              )}
              <MenuItem title="Edit" accessoryLeft={EditIcon} />
            </OverflowMenu>
          </View> */}
      </Layout>
    </Pressable>
  );
};

export default CallCard;
