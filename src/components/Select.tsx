import { StyleProp, View, ViewStyle } from 'react-native'
import { MenuView, MenuAction } from '@react-native-menu/menu'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import Text from './MyText'

export type SelectDataItem<T> = { label: string; value: T }
export type SelectData<T> = SelectDataItem<T>[]

export interface SelectProps<T> {
  data: T[]
  onChange: (item: T) => void
  /**
   * Currently selected value. Compared against item values via string coercion
   * so callers may pass either the raw value or its `.toString()`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  placeholder?: string
  style?: StyleProp<ViewStyle>
}

const Select = <T,>({
  data,
  onChange,
  value,
  style,
  placeholder,
}: SelectProps<T>) => {
  const theme = useTheme()

  // UIMenu keys actions by string id. Stringify both sides and map back to
  // the original item on selection so callers receive the untouched object.
  const items = data as unknown as SelectDataItem<unknown>[]
  const stringValue =
    value === undefined || value === null ? undefined : String(value)
  const selectedLabel = items.find(
    (i) => String(i.value) === stringValue
  )?.label

  const actions: MenuAction[] = items.map((item) => {
    const id = String(item.value)
    return {
      id,
      title: item.label,
      state: id === stringValue ? 'on' : 'off',
    }
  })

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const item = items.find((i) => String(i.value) === nativeEvent.event)
        if (item) onChange(item as unknown as T)
      }}
    >
      <View
        style={[
          {
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            borderWidth: 1,
            paddingHorizontal: 10,
            borderRadius: theme.numbers.borderRadiusSm,
            minHeight: 40,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          },
          style,
        ]}
      >
        <Text
          numberOfLines={1}
          style={{ color: theme.colors.text, fontSize: 14, flexShrink: 1 }}
        >
          {selectedLabel ?? placeholder ?? ''}
        </Text>
        <FontAwesomeIcon
          icon={faChevronDown}
          color={theme.colors.text}
          size={12}
        />
      </View>
    </MenuView>
  )
}

export default Select
