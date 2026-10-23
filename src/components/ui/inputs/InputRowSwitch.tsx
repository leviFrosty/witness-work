import Switch from '@/components/ui/Switch'
import InputRowContainer, {
  InputRowContainerProps,
} from '@/components/ui/inputs/InputRowContainer'

interface Props
  extends Pick<
    InputRowContainerProps,
    'labelTrailing' | 'info' | 'lastInSection' | 'leftIcon'
  > {
  /** Names the row and the switch, which screen readers read on its own. */
  label: string
  /** Under the label; screen readers read it as the switch's hint. */
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
      // The switch is the row's one stop for screen readers.
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
