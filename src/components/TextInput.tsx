import React, { forwardRef } from "react";
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
} from "react-native";
import useTheme from "../contexts/theme";
import { Errors } from "./inputs/TextInputRow";

export interface TextInputProps extends RNTextInputProps {
  error?: string;
  errors?: Errors;
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>;
  placeholder?: string;
}

const TextInput = forwardRef<RNTextInput, TextInputProps>((props, ref) => {
  const { error, setErrors, errors, placeholder, ...rest } = props;
  const theme = useTheme();

  return (
    <RNTextInput
      ref={ref}
      style={{
        borderWidth: error ? 1 : 0,
        padding: 3,
        borderRadius: theme.numbers.borderRadiusSm,
        borderColor: theme.colors.error,
        color: theme.colors.text,
      }}
      placeholderTextColor={theme.colors.textAlt}
      onChangeText={() => setErrors?.({ ...errors, id: "" })}
      hitSlop={{ top: 20, bottom: 20 }}
      placeholder={placeholder}
      textAlign="right"
      clearButtonMode="while-editing"
      returnKeyType="next"
      {...rest}
    />
  );
});

export default TextInput;
