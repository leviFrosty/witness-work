import { Switch } from 'react-native'
import InputRowContainer, {
  InputRowContainerProps,
} from '@/components/ui/inputs/InputRowContainer'

interface Props
  extends Pick<
    InputRowContainerProps,
    'label' | 'description' | 'info' | 'lastInSection'
  > {
  value: boolean
  onValueChange: (value: boolean) => void
}

export default function InputRowSwitch({
  value,
  onValueChange,
  ...props
}: Props) {
  return (
    <InputRowContainer
      {...props}
      controlStyle={{ width: 'auto', flexShrink: 0 }}
    >
      <Switch
        accessibilityLabel={props.label}
        value={value}
        onValueChange={onValueChange}
      />
    </InputRowContainer>
  )
}
