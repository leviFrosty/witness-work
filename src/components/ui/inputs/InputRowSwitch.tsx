import Switch from '@/components/ui/Switch'
import InputRowContainer, {
  InputRowContainerProps,
} from '@/components/ui/inputs/InputRowContainer'

interface Props
  extends Pick<
    InputRowContainerProps,
    'labelTrailing' | 'info' | 'lastInSection' | 'leftIcon'
  > {
  label: string

  description?: string
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
      labelReadByControl
      descriptionReadByControl
      controlStyle={{ width: 'auto', flexShrink: 0 }}
    >
      <Switch
        accessibilityLabel={props.label}
        accessibilityHint={props.description}
        value={value}
        onValueChange={onValueChange}
      />
    </InputRowContainer>
  )
}
