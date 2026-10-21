import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { alignText } from '@/lib/direction'

/** A read-only label and value on a details screen (Plan, Visit). */
export default function DetailRow({
  label,
  value,
  description,
  last,
}: {
  label: string
  value: string
  description?: string
  last?: boolean
}) {
  const theme = useTheme()
  // At accessibility text sizes the row puts the value under its label.
  const stacked = useAccessibilityTextSize()
  return (
    <InputRowContainer
      label={label}
      description={description}
      lastInSection={last}
      controlWidth='auto'
      // A long value (a range past midnight) wraps rather than squeezing the
      // label.
      controlStyle={stacked ? undefined : { maxWidth: '70%' }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          textAlign: alignText(stacked ? 'start' : 'end'),
        }}
        selectable
      >
        {value}
      </Text>
    </InputRowContainer>
  )
}
