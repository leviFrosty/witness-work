import {
  TextInput,
  NativeSyntheticEvent,
  TextInputFocusEventData,
} from "react-native";
import useTheme from "../contexts/theme";
import i18n from "../lib/locales";

interface Props {
  placeholder?: string;
  value: string;
  setValue:
    | React.Dispatch<React.SetStateAction<string | undefined>>
    | ((value: string) => unknown);
  onFocus?:
    | ((e: NativeSyntheticEvent<TextInputFocusEventData>) => void)
    | undefined;
  onBlur?:
    | ((e: NativeSyntheticEvent<TextInputFocusEventData>) => void)
    | undefined;
}

const SearchBar = ({
  placeholder,
  value,
  setValue,
  onFocus,
  onBlur,
}: Props) => {
  const theme = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={(val) => setValue(val)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholderTextColor={theme.colors.textAlt}
      style={{
        color: theme.colors.text,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.backgroundLighter,
        paddingVertical: 20,
        paddingHorizontal: 15,
        borderColor: theme.colors.border,
        borderWidth: 1,
        flexGrow: 1,
        fontSize: theme.fontSize("lg"),
      }}
      placeholder={placeholder ?? i18n.t("searchForContact")}
      clearButtonMode="while-editing"
      returnKeyType="search"
    />
  );
};
export default SearchBar;
