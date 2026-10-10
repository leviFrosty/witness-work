import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

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
  return (
    <InputRowContainer
      label={label}
      description={description}
      lastInSection={last}
      controlWidth='auto'
      // A long value (a range past midnight) wraps rather than squeezing the
      // label.
      controlStyle={{ maxWidth: '70%' }}
    >
      <Text
        style={{ color: theme.colors.textAlt, textAlign: 'right' }}
        selectable
      >
        {value}
      </Text>
    </InputRowContainer>
  )
}
