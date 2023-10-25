import { TextInput } from "react-native";
import theme from "../constants/theme";
import i18n from "../lib/locales";

interface Props {
  placeholder?: string;
  value: string;
  setValue:
    | React.Dispatch<React.SetStateAction<string | undefined>>
    | ((value: string) => unknown);
}

const SearchBar = ({ placeholder, value, setValue }: Props) => {
  return (
    <TextInput
      value={value}
      onChangeText={(val) => setValue(val)}
      style={{
        height: 65,
        borderRadius: theme.numbers.borderRadiusLg,
        backgroundColor: theme.colors.backgroundLighter,
        paddingHorizontal: 15,
        borderColor: theme.colors.border,
        borderWidth: 1,
        flexGrow: 1,
      }}
      placeholder={placeholder ?? i18n.t("searchForContact")}
      clearButtonMode="while-editing"
      returnKeyType="search"
    />
  );
};
export default SearchBar;
