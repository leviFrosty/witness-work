import { TextInput, View } from "react-native";
import theme from "../../constants/theme";
import { rowPaddingVertical } from "../../constants/Inputs";
import MyText from "../MyText";

interface Props {
  label: string;
  placeholder: string;
  lastInSection?: boolean;
  noHorizontalPadding?: boolean;
  textInputProps?: any;
}

const InputRow: React.FC<Props> = ({
  label,
  placeholder,
  lastInSection,
  noHorizontalPadding,
  textInputProps,
}) => {
  return (
    <View
      style={{
        flexDirection: "row",
        borderColor: theme.colors.border,
        borderBottomWidth: lastInSection ? 0 : 1,
        paddingBottom: lastInSection ? 0 : rowPaddingVertical,
        paddingRight: noHorizontalPadding ? 0 : 20,
        alignItems: "center",
        flexGrow: 1,
        gap: 15,
      }}
    >
      <MyText style={{ fontWeight: "600" }}>{label}</MyText>
      <View style={{ flexGrow: 1, flex: 1 }}>
        <TextInput
          hitSlop={{ top: 20, bottom: 20 }}
          placeholder={placeholder}
          textAlign="right"
          returnKeyType="next"
          {...textInputProps}
        />
      </View>
    </View>
  );
};

export default InputRow;
