import { useRef } from 'react'
import { View } from 'react-native'
import { Tag as TagIcon } from 'lucide-react-native'
import Text from '@/components/ui/MyText'
import {
  FORM_ROW_MIN_HEIGHT,
  FORM_ROW_PADDING_X,
} from '@/components/ui/inputs/FormRow'
import { useDockedFormLayout } from '@/components/ui/layout/DockedFormLayout'
import TypeSelectorRow, {
  CUSTOM_TYPE_VALUE,
  type TypeSelection,
} from '@/components/TypeSelectorRow'
import useTheme from '@/contexts/theme'

const TypeFormRow = (props: {
  value: string
  onChange: (selection: TypeSelection) => void

  invalid?: boolean
  hint?: string

  plain?: boolean
  paddingX?: number
}) => {
  const paddingX = props.paddingX ?? FORM_ROW_PADDING_X
  const theme = useTheme()
  const layout = useDockedFormLayout()
  const row = useRef<View>(null)
  return (
    <View
      ref={row}
      style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}
    >
      <TypeSelectorRow
        invalid={props.invalid}
        value={props.value}
        onChange={(selection) => {
          if (selection.value === CUSTOM_TYPE_VALUE) {
            layout.revealAfterLayout(row)
          }
          props.onChange(selection)
        }}
        plain={props.plain}
        leftIcon={props.plain ? undefined : TagIcon}
        onCustomNameFocus={() => layout.fieldFocused({ container: row })}
        lastInSection
        style={{
          minHeight: FORM_ROW_MIN_HEIGHT,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: paddingX,
          paddingRight: paddingX,
        }}
      />
      {props.hint && (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: 12,
            paddingHorizontal: paddingX,
            paddingBottom: 12,
          }}
        >
          {props.hint}
        </Text>
      )}
    </View>
  )
}

export default TypeFormRow
