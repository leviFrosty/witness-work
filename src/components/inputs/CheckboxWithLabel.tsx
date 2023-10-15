import Checkbox from "expo-checkbox";
import { Pressable } from "react-native";
import MyText from "../MyText";

const CheckboxWithLabel = ({
  value,
  setValue,
  label,
}: {
  value: boolean;
  setValue: (val: boolean) => void;
  label: string;
}) => {
  return (
    <Pressable
      style={{ flexDirection: "row", gap: 10 }}
      onPress={() => setValue(!value)}
    >
      <Checkbox value={value} onValueChange={(val: boolean) => setValue(val)} />
      <MyText>{label}</MyText>
    </Pressable>
  );
};

export default CheckboxWithLabel;
