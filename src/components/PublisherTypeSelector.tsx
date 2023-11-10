import { View } from "react-native";
import useTheme from "../contexts/theme";
import Text from "./MyText";
import i18n from "../lib/locales";
import { usePreferences } from "../stores/preferences";
import { publisherHours, publishers } from "../constants/publisher";
import Select from "./Select";

const PublisherTypeSelector = () => {
  const theme = useTheme();
  const items = [
    { label: i18n.t("publisher"), value: publishers[0] },
    { label: i18n.t("regularAuxiliary"), value: publishers[1] },
    { label: i18n.t("regularPioneer"), value: publishers[2] },
    { label: i18n.t("circuitOverseer"), value: publishers[3] },
    { label: i18n.t("specialPioneer"), value: publishers[4] },
  ];

  const { publisher, setPublisher } = usePreferences();

  return (
    <View>
      <Select
        data={items}
        onChange={({ value }) => setPublisher(value)}
        value={publisher}
      />
      <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
        {publisher === publishers[0]
          ? i18n.t("noHourRequirement")
          : i18n.t("hourMonthlyRequirement", {
              count: publisherHours[publisher],
            })}
      </Text>
    </View>
  );
};
export default PublisherTypeSelector;
