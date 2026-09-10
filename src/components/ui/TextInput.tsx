import React, { forwardRef } from 'react'
import { Input, InputProps, InputRef, TextArea } from 'tamagui'
import { StyleSheet } from 'react-native'
import useTheme from '@/contexts/theme'
import { Errors } from '@/types/textInput'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

export interface TextInputProps
  extends Omit<InputProps, 'placeholderTextColor' | 'selectionColor'> {
  error?: string
  errors?: Errors
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>
  placeholderTextColor?: InputProps['placeholderTextColor'] | (string & {})
  selectionColor?: InputProps['selectionColor'] | (string & {})
}

const TextInput = forwardRef<InputRef, TextInputProps>((props, ref) => {
  const {
    error,
    setErrors,
    errors,
    style,
    fontSize,
    fontFamily,
    fontWeight,
    lineHeight,
    letterSpacing,
    textAlign,
    textAlignVertical,
    ...rest
  } = props
  const theme = useTheme()

  const Component = (rest.multiline ? TextArea : Input) as typeof Input

  const resolvedStyle = StyleSheet.flatten([
    {
      minHeight: inputLayout.controlMinHeight,
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: theme.numbers.borderRadiusMd,
      borderColor: error ? theme.colors.error : theme.colors.border,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: theme.fonts.regular,
      fontSize: theme.fontSize('lg'),
      color: theme.colors.text,
      textAlign: 'right',
    },
    {
      ...(fontSize !== undefined && { fontSize }),
      ...(fontFamily !== undefined && { fontFamily }),
      ...(fontWeight !== undefined && { fontWeight }),
      ...(lineHeight !== undefined && { lineHeight }),
      ...(letterSpacing !== undefined && { letterSpacing }),
      ...(textAlign !== undefined && { textAlign }),
      ...(textAlignVertical !== undefined && { textAlignVertical }),
    } as unknown as InputProps['style'],
    style,
  ]) as InputProps['style'] & {
    backgroundColor?: string
    borderColor?: string
    borderRadius?: number
    borderWidth?: number
    borderStyle?: 'solid' | 'dotted' | 'dashed'
  }
  const callerProps = rest as InputProps & {
    backgroundColor?: string
    borderColor?: string
    borderRadius?: number
    borderWidth?: number
    borderStyle?: 'solid' | 'dotted' | 'dashed'
  }

  return (
    <Component
      ref={ref}
      unstyled
      style={resolvedStyle}
      placeholderTextColor={
        theme.colors.textAlt as InputProps['placeholderTextColor']
      }
      onChangeText={() => setErrors?.({ ...errors, id: '' })}
      hitSlop={{ top: 20, bottom: 20 }}
      clearButtonMode='while-editing'
      enterKeyHint='next'
      {...(rest as InputProps)}
      {...(fontSize !== undefined && { fontSize })}
      {...(fontFamily !== undefined && { fontFamily })}
      {...(fontWeight !== undefined && { fontWeight })}
      {...(lineHeight !== undefined && { lineHeight })}
      {...(letterSpacing !== undefined && { letterSpacing })}
      textAlign={textAlign ?? 'right'}
      {...(textAlignVertical !== undefined && { textAlignVertical })}
      {...{
        borderWidth: error
          ? 1
          : (callerProps.borderWidth ?? resolvedStyle.borderWidth ?? 1),
        borderStyle:
          callerProps.borderStyle ?? resolvedStyle.borderStyle ?? 'solid',
        borderColor: error
          ? theme.colors.error
          : (callerProps.borderColor ??
            resolvedStyle.borderColor ??
            theme.colors.border),
        borderRadius:
          callerProps.borderRadius ??
          resolvedStyle.borderRadius ??
          theme.numbers.borderRadiusMd,
        backgroundColor:
          callerProps.backgroundColor ??
          resolvedStyle.backgroundColor ??
          theme.colors.background,
      }}
    />
  )
})

export default TextInput
