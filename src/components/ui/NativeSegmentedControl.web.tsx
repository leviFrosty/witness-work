import { createElement, useRef } from 'react'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { isRtlLayout } from '@/lib/direction'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import type { NativeSegmentedControlProps } from '@/components/ui/NativeSegmentedControl.types'

/**
 * Segmented choices for the web: a track with the chosen segment raised, like
 * the platform controls. Each segment is a radio in a radio group, reachable
 * with Tab and chosen with Enter or Space.
 */
export default function NativeSegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
  testID,
}: NativeSegmentedControlProps<T>) {
  const theme = useTheme()
  const group = useRef<View>(null)
  // One Tab stop for the group, at the chosen segment (the first with none);
  // the arrow keys move the choice, as a radio group's do.
  const tabStop = options.some((option) => option.key === value)
    ? value
    : options[0]?.key
  const onKeyDown = (event: KeyboardEvent) => {
    // Arrow Right is forward in reading order: backward in right to left.
    const toward = isRtlLayout() ? -1 : 1
    const step = {
      ArrowRight: toward,
      ArrowDown: 1,
      ArrowLeft: -toward,
      ArrowUp: -1,
    }[event.key]
    if (!step || disabled) return
    event.preventDefault()
    const at = options.findIndex((option) => option.key === tabStop)
    const next = options[(at + step + options.length) % options.length]
    if (!next) return
    onChange(next.key)
    const node = group.current as unknown as HTMLElement | null
    requestAnimationFrame(() => {
      const radios = node?.querySelectorAll<HTMLElement>('[role=radio]')
      radios?.[options.indexOf(next)]?.focus()
    })
  }
  return createElement(
    'div',
    { style: { display: 'contents' }, onKeyDown },
    <View
      ref={group}
      accessibilityRole='radiogroup'
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          gap: 2,
          padding: 3,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: theme.colors.backgroundLighter,
          borderWidth: 1,
          borderColor: theme.colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const active = option.key === value
        return (
          <Button
            key={option.key}
            noTransform
            onPress={() => onChange(option.key)}
            disabled={disabled}
            accessibilityRole='radio'
            accessibilityState={{ checked: active, disabled }}
            aria-checked={active}
            focusable={option.key === tabStop}
            testID={option.testID}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: MIN_TOUCH_TARGET,
              paddingHorizontal: 12,
              borderRadius: theme.numbers.borderRadiusMd - 3,
              backgroundColor: active ? theme.colors.card : 'transparent',
              borderWidth: 1,
              borderColor: active ? theme.colors.border : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? theme.colors.text : theme.colors.textAlt,
                fontFamily: active ? theme.fonts.semiBold : theme.fonts.regular,
              }}
            >
              {option.label}
            </Text>
          </Button>
        )
      })}
    </View>
  )
}
