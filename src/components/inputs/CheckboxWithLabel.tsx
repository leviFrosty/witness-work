import Checkbox from "expo-checkbox";
import { View } from "react-native";
import Text from "../MyText";
import theme from "../../constants/theme";

const CheckboxWithLabel = ({
  value,
  setValue,
  label,
  disabled,
  description,
  descriptionOnlyOnDisabled,
}: {
  value: boolean;
  setValue: (val: boolean) => void;
  label: string;
  disabled?: boolean;
  description?: string;
  descriptionOnlyOnDisabled?: boolean;
}) => {
  const renderDescription = () => {
    if (!description) {
      return null;
    }

    if (
      descriptionOnlyOnDisabled === undefined ||
      (descriptionOnlyOnDisabled && disabled)
    ) {
      return (
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
          }}
        >
          {description}
        </Text>
      );
    }
  };

  return (
    <View style={{ gap: 10, flex: 1 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          gap: 10,
          alignItems: "center",
        }}
      >
        <Checkbox
          hitSlop={{ top: 15, right: 15, bottom: 15, left: 15 }}
          disabled={disabled}
          value={value}
          onValueChange={(val: boolean) => setValue(val)}
        />
        <Text>{label}</Text>
      </View>
      {renderDescription()}
    </View>
  );
};

export default CheckboxWithLabel;
