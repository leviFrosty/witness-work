import { Dropdown } from 'react-native-element-dropdown'
import useTheme from '../contexts/theme'
import { DropdownProps } from 'react-native-element-dropdown/lib/typescript/components/Dropdown/model'

export type SelectDataItem<T> = { label: string; value: T }
export type SelectData<T> = SelectDataItem<T>[]

export interface SelectProps<T>
  extends Omit<Omit<DropdownProps<T>, 'labelField'>, 'valueField'> {
  data: T[]
  onChange: (item: T) => void
  /**
   * Actual value, usually stored in state.
   *
   * @example
   *   const counter = () => {
   *   const [incrementBy, setIncrementBy] = useState(1)
   *   const options = [{label: "1", value: 1}, {label: "2": value: 2}]
   *
   *   return (
   *   <Select
   *   data={options}
   *   onChange={({value} => setIncrementBy(value))}
   *   value={incrementBy}
   *   />
   *   })
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
}

const Select = <T,>({
  data,
  onChange,
  value,
  style,
  ...props
}: SelectProps<T>) => {
  const theme = useTheme()

  return (
    <Dropdown
      data={data}
      labelField={'label' as keyof T}
      valueField={'value' as keyof T}
      style={[
        {
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
          borderWidth: 1,
          paddingHorizontal: 10,
          borderRadius: theme.numbers.borderRadiusSm,
          minHeight: 40,
        },
        [style],
      ]}
      selectedTextStyle={{
        color: theme.colors.text,
        fontSize: 14,
      }}
      itemTextStyle={{
        color: theme.colors.text,
        fontSize: 14,
      }}
      activeColor={theme.colors.card}
      placeholderStyle={{ color: theme.colors.text, fontSize: 14 }}
      containerStyle={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.background,
      }}
      onChange={onChange}
      value={value}
      {...props}
    />
  )
}

export default Select
