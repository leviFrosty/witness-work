import { TextInput, View } from "react-native";
import theme from "../../constants/theme";
import Text from "../MyText";
import InputRowContainer from "./InputRowContainer";

export type Errors = Record<string, string>;

interface Props {
  /**
   * Errors key should match param id.
   * @example errors: { name: "" }
   * id: 'name'
   */
  errors?: Errors;
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>;
  /**
   * ID should also be used as key in error object
   */
  id?: string;
  label: string;
  placeholder?: string;
  lastInSection?: boolean;
  noHorizontalPadding?: boolean;
  // eslint-disable-next-line
  textInputProps?: any;
}

const TextInputRow: React.FC<Props> = ({
  id,
  errors,
  setErrors,
  label,
  placeholder,
  lastInSection,
  noHorizontalPadding,
  textInputProps,
}) => {
  const error = id && errors ? errors[id] : undefined;

  return (
    <InputRowContainer
      lastInSection={lastInSection}
      noHorizontalPadding={noHorizontalPadding}
      label={label}
    >
      <View style={{ flexGrow: 1, flex: 1, gap: 5 }}>
        <TextInput
          style={{
            borderWidth: error ? 1 : 0,
            padding: 3,
            borderRadius: theme.numbers.borderRadiusSm,
            borderColor: theme.colors.error,
          }}
          onChangeText={() => setErrors?.({ ...errors, id: "" })}
          hitSlop={{ top: 20, bottom: 20 }}
          placeholder={placeholder}
          textAlign="right"
          clearButtonMode="while-editing"
          returnKeyType="next"
          {...textInputProps}
        />
        {error && (
          <Text
            style={{
              color: theme.colors.error,
              fontFamily: "Inter_600SemiBold",
              textAlign: "right",
              fontSize: 12,
            }}
          >
            {error}
          </Text>
        )}
      </View>
    </InputRowContainer>
  );
};

export default TextInputRow;
