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

/**
 * The Type picker as the last row of a docked form's details list, keeping a
 * new custom category's name field in view while it's typed.
 */
const TypeFormRow = (props: {
  value: string
  onChange: (selection: TypeSelection) => void
  /** Shown under the row, e.g. why Save is disabled. */
  hint?: string
}) => {
  const theme = useTheme()
  const layout = useDockedFormLayout()
  const row = useRef<View>(null)
  return (
    <View
      ref={row}
      style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}
    >
      <TypeSelectorRow
        value={props.value}
        onChange={(selection) => {
          // Custom adds a name field under the row.
          if (selection.value === CUSTOM_TYPE_VALUE) {
            layout.revealAfterLayout(row)
          }
          props.onChange(selection)
        }}
        leftIcon={TagIcon}
        // Keep the hint under the name field in view while typing too.
        onCustomNameFocus={() => layout.fieldFocused({ container: row })}
        lastInSection
        style={{
          minHeight: FORM_ROW_MIN_HEIGHT,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: FORM_ROW_PADDING_X,
          paddingRight: FORM_ROW_PADDING_X,
        }}
      />
      {props.hint && (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: 12,
            paddingHorizontal: FORM_ROW_PADDING_X,
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
