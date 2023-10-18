import { View, DimensionValue, ColorValue } from "react-native";
import { publisherHours } from "../constants/publisher";
import { usePreferences } from "../stores/preferences";
import { useServiceReport } from "../stores/serviceReport";
import theme from "../constants/theme";
import { FontAwesome } from "@expo/vector-icons";
import {
  calculateProgress,
  getTotalHoursForCurrentMonth,
} from "../lib/serviceReport";
import { useMemo } from "react";

const ProgressBarSegment = ({
  backgroundColor,
  width,
}: {
  backgroundColor: ColorValue | undefined;
  width: DimensionValue;
}) => {
  return (
    <View
      style={{
        backgroundColor,
        width,
        height: 18,
        borderRadius: theme.numbers.borderRadiusLg,
      }}
    />
  );
};

const Bad = ({ active }: { active: boolean }) => {
  return (
    <ProgressBarSegment
      backgroundColor={active ? theme.colors.warn : theme.colors.warnAlt}
      width={"60%"}
    />
  );
};

const Good = ({ active }: { active: boolean }) => {
  return (
    <ProgressBarSegment
      backgroundColor={active ? theme.colors.accent3 : theme.colors.accent3Alt}
      width={"30%"}
    />
  );
};

const Success = ({ active }: { active: boolean }) => {
  return (
    <ProgressBarSegment
      backgroundColor={active ? theme.colors.accent : theme.colors.accentAlt}
      width={"10%"}
    />
  );
};

const ProgressBar = () => {
  const { serviceReports } = useServiceReport();
  const hours = getTotalHoursForCurrentMonth(serviceReports);
  const { publisher } = usePreferences();
  const goalHours = publisherHours[publisher];
  const progress = useMemo(
    () => calculateProgress({ hours, goalHours }),
    [hours, goalHours]
  );

  const arrowProgress: DimensionValue = `${progress * 100 - 2}%`; // Offsets slightly for arrow width;

  const badProgress = progress < 0.6;
  const goodProgress = progress >= 0.6 && progress < 0.95;
  const successProgress = progress >= 0.95;

  const arrowColor = () =>
    badProgress
      ? theme.colors.warn
      : goodProgress
      ? theme.colors.accent3
      : theme.colors.accent;

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 2,
        position: "relative",
        maxWidth: 175,
        marginBottom: 15,
      }}
    >
      <Bad active={badProgress} />
      <Good active={goodProgress} />
      <Success active={successProgress} />
      <View style={{ position: "absolute", left: arrowProgress, top: 8 }}>
        <FontAwesome
          style={{ color: arrowColor(), fontSize: 30 }}
          name="caret-up"
        />
      </View>
    </View>
  );
};

export default ProgressBar;
