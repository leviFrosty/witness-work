import React, { forwardRef, useState } from 'react'
import { Input, InputProps, InputRef, TextArea } from 'tamagui'
import {
  Platform,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native'
import useTheme from '@/contexts/theme'
import { Errors } from '@/types/textInput'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { alignInput, alignText, type FlowAlign } from '@/lib/direction'
import { tracking } from '@/lib/tracking'

export interface TextInputProps
  extends Omit<
    InputProps,
    'placeholderTextColor' | 'selectionColor' | 'textAlign'
  > {
  /** Reading-order alignment; `end` (the trailing side) by default. */
  textAlign?: FlowAlign | 'center'
  invalid?: boolean
  error?: string
  errors?: Errors
  setErrors?: React.Dispatch<React.SetStateAction<Errors>>
  placeholderTextColor?: InputProps['placeholderTextColor'] | (string & {})
  selectionColor?: InputProps['selectionColor'] | (string & {})
}

// Sizing that belongs to the box around the input when Android draws its own
// placeholder (see `drawsPlaceholder`).
const OUTER_LAYOUT_KEYS = [
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'width',
  'minWidth',
  'maxWidth',
  'margin',
  'marginHorizontal',
  'marginVertical',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginStart',
  'marginEnd',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'zIndex',
] as const

const PLACEHOLDER_ALIGN_VERTICAL = {
  top: 'flex-start',
  bottom: 'flex-end',
} as const

// A `textAlign` in a caller's style reads as start/end too.
const toFlow = (
  align: TextStyle['textAlign'] | FlowAlign | undefined
): FlowAlign | 'center' => {
  if (align === 'center') return 'center'
  if (align === 'left' || align === 'start') return 'start'
  return 'end'
}

const TextInput = forwardRef<InputRef, TextInputProps>((props, ref) => {
  const {
    error,
    invalid,
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
  const flowAlign = toFlow(
    textAlign ?? (StyleSheet.flatten(style) as TextStyle | undefined)?.textAlign
  )
  const inputAlign = flowAlign === 'center' ? 'center' : alignInput(flowAlign)

  const resolvedStyle = StyleSheet.flatten([
    {
      minHeight: inputLayout.controlMinHeight,
      borderWidth: 1,
      borderStyle: 'solid',
      borderRadius: theme.numbers.borderRadiusMd,
      borderColor: error || invalid ? theme.colors.error : theme.colors.border,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontFamily: theme.fonts.regular,
      fontSize: theme.fontSize('md'),
      color: theme.colors.text,
    },
    {
      ...(fontSize !== undefined && { fontSize }),
      ...(fontFamily !== undefined && { fontFamily }),
      ...(fontWeight !== undefined && { fontWeight }),
      ...(lineHeight !== undefined && { lineHeight }),
      ...(letterSpacing !== undefined && {
        letterSpacing: tracking(letterSpacing),
      }),
      ...(textAlignVertical !== undefined && { textAlignVertical }),
    } as unknown as InputProps['style'],
    style,
    { textAlign: inputAlign },
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
  const borderWidth =
    error || invalid
      ? 1
      : (callerProps.borderWidth ?? resolvedStyle.borderWidth ?? 1)

  // TalkBack names an EditText by its text, and Android reports the hint as
  // the text of an empty field, so a native placeholder hides the
  // accessibilityLabel. On Android, draw the placeholder ourselves and hand it
  // to TalkBack as the hint, the way VoiceOver reads label then placeholder.
  const accessibleLabel = rest.accessibilityLabel ?? rest['aria-label']
  const drawsPlaceholder =
    Platform.OS === 'android' &&
    !!accessibleLabel &&
    !!rest.placeholder &&
    rest.placeholder !== accessibleLabel
  const [uncontrolledText, setUncontrolledText] = useState(
    rest.defaultValue ?? ''
  )
  const isEmpty = !(rest.value ?? uncontrolledText)
  // A wrapping placeholder drawn over a multiline field is taller than the
  // empty field; the field grows to hold it.
  const [placeholderHeight, setPlaceholderHeight] = useState(0)

  const outerStyle: ViewStyle = {}
  const innerStyle = { ...(resolvedStyle as object) } as TextStyle &
    Record<string, unknown>
  if (drawsPlaceholder) {
    for (const key of OUTER_LAYOUT_KEYS) {
      if (innerStyle[key] === undefined) continue
      ;(outerStyle as Record<string, unknown>)[key] = innerStyle[key]
      delete innerStyle[key]
    }
    innerStyle.flexGrow = 1
  }
  const inset = (side: 'Top' | 'Right' | 'Bottom' | 'Left') => {
    const axis = side === 'Top' || side === 'Bottom' ? 'Vertical' : 'Horizontal'
    const padding =
      innerStyle[`padding${side}`] ??
      innerStyle[`padding${axis}`] ??
      innerStyle.padding
    return (typeof padding === 'number' ? padding : 0) + borderWidth
  }
  if (drawsPlaceholder && rest.multiline && isEmpty && placeholderHeight) {
    const fit = placeholderHeight + inset('Top') + inset('Bottom')
    const min = innerStyle.minHeight
    innerStyle.minHeight = typeof min === 'number' ? Math.max(min, fit) : fit
  }

  const input = (
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
      {...(letterSpacing !== undefined && {
        letterSpacing: tracking(letterSpacing),
      })}
      textAlign={inputAlign}
      // Tamagui's native Input reads only `autoFocusNative` and drops
      // `autoFocus` (web), so a field asking for focus never got it.
      autoFocusNative={rest.autoFocusNative ?? rest.autoFocus}
      {...(textAlignVertical !== undefined && { textAlignVertical })}
      {...{
        borderWidth,
        borderStyle:
          callerProps.borderStyle ?? resolvedStyle.borderStyle ?? 'solid',
        borderColor:
          error || invalid
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
      {...(drawsPlaceholder && {
        style: innerStyle as InputProps['style'],
        placeholder: undefined,
        accessibilityHint:
          rest.accessibilityHint ?? (isEmpty ? rest.placeholder : undefined),
        onChangeText: (text: string) => {
          setUncontrolledText(text)
          if (rest.onChangeText) rest.onChangeText(text)
          else setErrors?.({ ...errors, id: '' })
        },
      })}
    />
  )

  if (!drawsPlaceholder) return input

  return (
    <View style={outerStyle}>
      {input}
      {isEmpty ? (
        <View
          pointerEvents='none'
          importantForAccessibility='no-hide-descendants'
          style={{
            ...StyleSheet.absoluteFill,
            // A multiline placeholder gets its full height to wrap into (a
            // bottom edge would clamp it to the empty field's height).
            ...(rest.multiline && { bottom: undefined, minHeight: '100%' }),
            paddingTop: inset('Top'),
            paddingRight: inset('Right'),
            paddingBottom: inset('Bottom'),
            paddingLeft: inset('Left'),
            justifyContent:
              PLACEHOLDER_ALIGN_VERTICAL[
                textAlignVertical as keyof typeof PLACEHOLDER_ALIGN_VERTICAL
              ] ?? 'center',
          }}
        >
          <Text
            numberOfLines={rest.multiline ? undefined : 1}
            onLayout={
              rest.multiline
                ? (e) => setPlaceholderHeight(e.nativeEvent.layout.height)
                : undefined
            }
            style={{
              color: (rest.placeholderTextColor ??
                theme.colors.textAlt) as string,
              fontFamily: innerStyle.fontFamily,
              fontSize: innerStyle.fontSize,
              fontWeight: innerStyle.fontWeight,
              // Already passed through tracking() above.
              // eslint-disable-next-line no-restricted-syntax
              letterSpacing: innerStyle.letterSpacing,
              textAlign:
                flowAlign === 'center' ? 'center' : alignText(flowAlign),
            }}
          >
            {rest.placeholder}
          </Text>
        </View>
      ) : null}
    </View>
  )
})

export default TextInput
