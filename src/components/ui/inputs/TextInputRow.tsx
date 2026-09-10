import React, { forwardRef, Ref, useImperativeHandle, useRef } from 'react'
import {
  View,
  TextInput as RNTextInput,
  ViewStyle,
  StyleProp,
} from 'react-native'
import Text from '@/components/ui/MyText'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import MyTextInput, { TextInputProps } from '@/components/ui/TextInput'
import { Errors } from '@/types/textInput'
import useTheme from '@/contexts/theme'

interface TextInputRowProps {
  errors?: Errors
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>
  id?: string
  label: string
  info?: string
  description?: string
  lastInSection?: boolean
  noHorizontalPadding?: boolean
  textInputProps?: TextInputProps
  required?: boolean
  style?: StyleProp<ViewStyle>
  controlStyle?: StyleProp<ViewStyle>
  controlWidth?: 'compact' | 'full' | 'auto'
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
      info,
      description,
      lastInSection,
      noHorizontalPadding,
      required,
      style,
      controlStyle,
      controlWidth,
      textInputProps,
    },
    ref: Ref<RNTextInput>
  ) => {
    const theme = useTheme()
    const error = id && errors ? errors[id] : undefined

    const innerRef = useRef<RNTextInput>(null)
    useImperativeHandle(ref, () => innerRef.current as RNTextInput)

    return (
      <InputRowContainer
        lastInSection={lastInSection}
        noHorizontalPadding={noHorizontalPadding}
        label={label}
        info={info}
        description={description}
        required={required}
        style={style}
        controlStyle={controlStyle}
        controlWidth={
          controlWidth ?? (textInputProps?.multiline ? 'full' : 'compact')
        }
        onLabelPress={() => innerRef.current?.focus()}
      >
        <View style={{ flexGrow: 1, flex: 1, gap: 5 }}>
          <MyTextInput
            ref={innerRef}
            error={error}
            accessibilityLabel={label}
            placeholderTextColor={theme.colors.textAlt}
            onChangeText={() => setErrors?.({ ...errors, [id || '']: '' })}
            hitSlop={{ top: 20, bottom: 20 }}
            textAlign='right'
            clearButtonMode='while-editing'
            enterKeyHint='next'
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
