import React, { forwardRef, Ref } from 'react'
import {
  View,
  TextInput as RNTextInput,
  ViewStyle,
  StyleProp,
} from 'react-native'
import useTheme from '../../contexts/theme'
import Text from '../MyText'
import InputRowContainer from './InputRowContainer'
import MyTextInput, { TextInputProps } from '../TextInput'

export type Errors = Record<string, string>

interface TextInputRowProps {
  errors?: Errors
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>
  id?: string
  label: string
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  textInputProps?: TextInputProps
  required?: boolean
  style?: StyleProp<ViewStyle>
}

const TextInputRow: React.ForwardRefExoticComponent<
  TextInputRowProps & React.RefAttributes<RNTextInput>
> = forwardRef<RNTextInput, TextInputRowProps>(
  (
    {
      id,
      errors,
      setErrors,
      label,
      lastInSection,
      noHorizontalPadding,
      required,
      style,
      textInputProps,
    },
    ref: Ref<RNTextInput>
  ) => {
    const theme = useTheme()
    const error = id && errors ? errors[id] : undefined

    return (
      <InputRowContainer
        lastInSection={lastInSection}
        noHorizontalPadding={noHorizontalPadding}
        label={label}
        required={required}
        style={style}
      >
        <View style={{ flexGrow: 1, flex: 1, gap: 5 }}>
          <MyTextInput
            ref={ref}
            style={{
              borderWidth: error ? 1 : 0,
              padding: 3,
              borderRadius: theme.numbers.borderRadiusSm,
              borderColor: theme.colors.error,
              color: theme.colors.text,
            }}
            placeholderTextColor={theme.colors.textAlt}
            onChangeText={() => setErrors?.({ ...errors, [id || '']: '' })}
            hitSlop={{ top: 20, bottom: 20 }}
            textAlign='right'
            clearButtonMode='while-editing'
            returnKeyType='next'
            {...textInputProps}
          />
          {error && (
            <Text
              style={{
                color: theme.colors.error,
                fontFamily: theme.fonts.semiBold,
                textAlign: 'right',
                fontSize: 12,
              }}
            >
              {error}
            </Text>
          )}
        </View>
      </InputRowContainer>
    )
  }
)

export default TextInputRow
