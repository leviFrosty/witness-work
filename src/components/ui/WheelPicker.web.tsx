import type { PickerItem } from '@quidone/react-native-wheel-picker'
import useTheme from '@/contexts/theme'
import useResolvedScheme from '@/components/ui/web/useResolvedScheme'

const VISIBLE_ITEM_COUNT = 5

type Props<T extends string | number> = {
  data: ReadonlyArray<PickerItem<T>>
  value: T
  onValueChange: (value: T) => void
  /** What the list picks, read by screen readers ("Hours"). */
  accessibilityLabel: string
  testID?: string
}

/**
 * The wheel's web stand-in: a list box of the same five rows. It scrolls with a
 * wheel or touch, takes the arrow keys, Home, End and typing, and reads as a
 * list box to a screen reader, none of which a dragged wheel does with a
 * mouse.
 */
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
