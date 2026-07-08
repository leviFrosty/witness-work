import React, { forwardRef } from 'react'
import { Input, InputProps, InputRef, TextArea } from 'tamagui'
import useTheme from '@/contexts/theme'
import { Errors } from '@/types/textInput'

export interface TextInputProps
  extends Omit<InputProps, 'placeholderTextColor' | 'selectionColor'> {
  error?: string
  errors?: Errors
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>
  placeholderTextColor?: InputProps['placeholderTextColor'] | (string & {})
  selectionColor?: InputProps['selectionColor'] | (string & {})
}

const TextInput = forwardRef<InputRef, TextInputProps>((props, ref) => {
  const { error, setErrors, errors, ...rest } = props
  const theme = useTheme()

  const Component = (rest.multiline ? TextArea : Input) as typeof Input

  return (
    <Component
      ref={ref}
      unstyled
      style={{
        borderWidth: error ? 1 : 0,
        padding: 3,
        borderRadius: theme.numbers.borderRadiusSm,
        borderColor: theme.colors.error,
        color: theme.colors.text,
      }}
      placeholderTextColor={
        theme.colors.textAlt as InputProps['placeholderTextColor']
      }
      onChangeText={() => setErrors?.({ ...errors, id: '' })}
      hitSlop={{ top: 20, bottom: 20 }}
      textAlign='right'
      clearButtonMode='while-editing'
      enterKeyHint='next'
      {...(rest as InputProps)}
    />
  )
})

export default TextInput
