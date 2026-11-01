import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import { alignText } from '@/lib/direction'

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

  const stacked = useAccessibilityTextSize()
  return (
    <InputRowContainer
      label={label}
      description={description}
      lastInSection={last}
      controlWidth='auto'
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
