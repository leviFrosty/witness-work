import React from 'react'
import Select, { SelectProps } from '../Select'
import InputRowContainer, { InputRowContainerProps } from './InputRowContainer'
import { View } from 'react-native'

interface InputRowSelectProps<T> extends InputRowContainerProps {
  selectProps: SelectProps<T>
}

const InputRowSelect = <T extends { label: string; value: unknown }>(
  props: InputRowSelectProps<T>
) => {
  const { selectProps, ...rest } = props
  return (
    <InputRowContainer {...rest}>
      <View style={{ flex: 1 }}>
        <Select {...selectProps} />
      </View>
    </InputRowContainer>
  )
}

export default InputRowSelect
