import {
  TextInput,
  NativeSyntheticEvent,
  TextInputFocusEventData,
} from 'react-native'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import XView from './layout/XView'
import IconButton from './IconButton'
import { faSearch } from '@fortawesome/free-solid-svg-icons'

interface Props {
  placeholder?: string
  value: string
  setValue:
    | React.Dispatch<React.SetStateAction<string | undefined>>
    | ((value: string) => unknown)
  onFocus?:
    | ((e: NativeSyntheticEvent<TextInputFocusEventData>) => void)
    | undefined
  onBlur?:
    | ((e: NativeSyntheticEvent<TextInputFocusEventData>) => void)
    | undefined
}

const SearchBar = ({
  placeholder,
  value,
  setValue,
  onFocus,
  onBlur,
}: Props) => {
  const theme = useTheme()

  return (
    <XView
      style={{
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.backgroundLighter,
        height: '100%',
        paddingHorizontal: 20,
        borderColor: theme.colors.border,
        borderWidth: 1,
        flex: 1,
        gap: 10,
      }}
    >
      <IconButton icon={faSearch} color={theme.colors.textAlt} />
      <TextInput
        value={value}
        onChangeText={(val) => setValue(val)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholderTextColor={theme.colors.textAlt}
        style={{
          color: theme.colors.text,
        }}
        placeholder={placeholder ?? i18n.t('searchForContact')}
        clearButtonMode='while-editing'
        returnKeyType='search'
      />
    </XView>
  )
}
export default SearchBar
