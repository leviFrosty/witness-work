import Switch from '@/components/ui/Switch'
import InputRowContainer, {
  InputRowContainerProps,
} from '@/components/ui/inputs/InputRowContainer'

interface Props
  extends Pick<
    InputRowContainerProps,
    'description' | 'labelTrailing' | 'info' | 'lastInSection' | 'leftIcon'
  > {
  /** Names the row and the switch, which screen readers read on its own. */
  label: string
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
