import type { PickerItem } from '@quidone/react-native-wheel-picker'
import useTheme from '@/contexts/theme'
import useResolvedScheme from '@/components/ui/web/useResolvedScheme'

const VISIBLE_ITEM_COUNT = 5

type Props<T extends string | number> = {
  data: ReadonlyArray<PickerItem<T>>
  value: T
  onValueChange: (value: T) => void

  accessibilityLabel: string
  testID?: string
}

const WheelPicker = <T extends string | number>({
  data,
  value,
  onValueChange,
  accessibilityLabel,
  testID,
}: Props<T>) => {
  const theme = useTheme()
  const scheme = useResolvedScheme()
  return (
    <select
      size={VISIBLE_ITEM_COUNT}
      aria-label={accessibilityLabel}
      data-testid={testID}
      value={String(value)}
      onChange={(event) => {
        const chosen = data.find(
          (item) => String(item.value) === event.target.value
        )
        if (chosen) onValueChange(chosen.value)
      }}
      style={{
        boxSizing: 'border-box',
        width: 'calc(100% - 16px)',
        margin: '0 8px',
        padding: 4,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.card,
        color: theme.colors.text,
        colorScheme: scheme,
        font: `${theme.fontSize('xl')}px ${theme.fonts.regular}, system-ui, sans-serif`,
        textAlign: 'center',
      }}
    >
      {data.map((item) => (
        <option
          key={item.value}
          value={String(item.value)}
          data-testid={testID && `${testID}-${item.value}`}
        >
          {item.label ?? item.value}
        </option>
      ))}
    </select>
  )
}

export default WheelPicker
