import { useState } from 'react'
import { Keyboard, View } from 'react-native'
import {
  Minus as MinusIcon,
  Pencil as PencilIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import WheelPicker from '@/components/ui/WheelPicker'
import useTheme from '@/contexts/theme'
import { lightModeColors } from '@/constants/theme'
import { entryMinutes, splitMinutes } from '@/lib/entryMinutes'
import i18n from '@/lib/locales'
import {
  formatMinutes,
  formatMinutesCompact,
  useFormattedMinutes,
} from '@/lib/minutes'
import { formatPlainNumber } from '@/lib/numbers'
import { usePreferences } from '@/stores/preferences'
import {
  DURATION_PRESETS,
  DURATION_STEP,
  isExactInFormat,
  MAX_DURATION_HOURS,
  stepDuration,
} from '@/features/service-reports/lib/durationInput'

export type DurationInputMethod = 'preset' | 'stepper' | 'exact' | 'plan'

type Props = {
  hours: number
  minutes: number
  setDuration: (hours: number, minutes: number) => void

  onInput?: (method: DurationInputMethod) => void
  invalid?: boolean

  size: 'large' | 'compact'

  testID: string
}

const useControlColors = () => {
  const theme = useTheme()
  return theme.colors.background === lightModeColors.background
    ? { fill: 'rgba(118,118,128,0.16)' }
    : { fill: 'rgba(118,118,128,0.32)' }
}

const Step = (props: {
  icon: AppIcon
  label: string
  disabled?: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  const { fill } = useControlColors()
  return (
    <Button
      noTransform
      onPress={props.disabled ? undefined : props.onPress}
      accessibilityRole='button'
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      style={{
        opacity: props.disabled ? 0.45 : 1,
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill,
      }}
    >
      <LucideIcon
        icon={props.icon}
        size={22}
        strokeWidth={2.25}
        color={theme.colors.text}
      />
    </Button>
  )
}

const DurationValue = (props: {
  minutes: number
  size: 'large' | 'compact'
}) => {
  const theme = useTheme()
  const { formatted } = useFormattedMinutes(props.minutes)
  const large = props.size === 'large'
  const fontSize = large ? 64 : 40

  const parts = formatted.split(/(\d+(?:[.,]\d+)?)/).filter(Boolean)
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={{
        fontSize,
        lineHeight: large ? Math.round(fontSize * 1.08) : undefined,
        fontFamily: theme.fonts.bold,
        color: props.minutes ? theme.colors.text : theme.colors.textAlt,
        fontVariant: ['tabular-nums'],
      }}
    >
      {parts.map((part, index) =>
        /\d/.test(part) ? (
          part
        ) : (
          <Text
            key={index}
            style={{
              fontSize: fontSize * (large ? 0.42 : 0.6),
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.textAlt,
            }}
          >
            {part}
          </Text>
        )
      )}
    </Text>
  )
}

const Presets = (props: {
  value: number
  onChange: (minutes: number) => void
}) => {
  const theme = useTheme()
  const format = usePreferences((s) => s.timeDisplayFormat)
  return (
    <View
      accessibilityRole='radiogroup'
      style={{ flexDirection: 'row', gap: 6 }}
    >
      {DURATION_PRESETS.map((preset) => {
        const active = preset === props.value
        return (
          <View
            key={preset}
            style={{
              flex: 1,
              borderRadius: theme.numbers.borderRadiusMd,
              backgroundColor: theme.colors.card,
            }}
          >
            <Button
              noTransform
              onPress={() => props.onChange(preset)}
              accessibilityRole='radio'
              accessibilityLabel={formatMinutes(preset, format).formatted}
              accessibilityState={{ selected: active, checked: active }}
              testID={`time-entry-preset-${preset}`}
              style={{
                height: MIN_TOUCH_TARGET,
                borderRadius: theme.numbers.borderRadiusMd,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active
                  ? theme.colors.accentTranslucent
                  : 'transparent',
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? theme.colors.accent : theme.colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: theme.fontSize('md'),
                  color: theme.colors.text,
                  fontFamily: active ? theme.fonts.bold : theme.fonts.semiBold,
                }}
              >
                {format === 'decimal'
                  ? formatMinutesCompact(preset / 60, { unit: 'hours' })
                  : formatMinutesCompact(preset)}
              </Text>
            </Button>
          </View>
        )
      })}
    </View>
  )
}

const DurationInput = (props: Props) => {
  const theme = useTheme()
  const total = entryMinutes(props)
  const { formatted } = useFormattedMinutes(total)
  const format = usePreferences((s) => s.timeDisplayFormat)
  const large = props.size === 'large'

  const exact = isExactInFormat(total, format)
    ? undefined
    : formatMinutes(total, 'short').formatted
  const [picking, setPicking] = useState(false)
  const [draftHours, setDraftHours] = useState(props.hours)
  const [draftMinutes, setDraftMinutes] = useState(props.minutes)
  const setTotal = (next: number, method: DurationInputMethod) => {
    const { hours, minutes } = splitMinutes(next)
    props.setDuration(hours, minutes)
    props.onInput?.(method)
  }
  const openWheels = () => {
    Keyboard.dismiss()
    setDraftHours(props.hours)
    setDraftMinutes(props.minutes)
    setPicking(true)
  }
  const wheel = (values: number[]) =>
    values.map((value) => ({ value, label: formatPlainNumber(value) }))
  const unit = (text: string) => (
    <Text style={{ color: theme.colors.textAlt, minWidth: 40 }}>{text}</Text>
  )

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Step
          icon={MinusIcon}
          label={i18n.t('timeForm_less', {
            duration: formatMinutesCompact(DURATION_STEP),
          })}
          disabled={total === 0}
          onPress={() => setTotal(stepDuration(total, -1), 'stepper')}
        />
        <Button
          noTransform
          onPress={openWheels}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('time')}
          accessibilityValue={{ text: exact ?? formatted }}
          accessibilityHint={i18n.t('timeForm_exactHint')}
          testID={`${props.testID}-duration-pill`}
          style={{
            flex: 1,
            minHeight: large ? 76 : 64,
            borderRadius: theme.numbers.borderRadiusMd,

            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',

            borderWidth: props.invalid ? 1.5 : 0,
            borderColor: theme.colors.error,
          }}
        >
          {}
          <View style={{ flexShrink: 1, marginHorizontal: large ? 34 : 28 }}>
            <DurationValue minutes={total} size={props.size} />
            <View
              style={{
                position: 'absolute',
                start: '100%',
                top: 0,
                bottom: 0,
                justifyContent: 'center',
                paddingStart: 8,
                paddingTop: large ? 10 : 8,
              }}
            >
              <LucideIcon
                icon={PencilIcon}
                size={large ? 20 : 16}
                strokeWidth={2}
                color={theme.colors.textAlt}
              />
            </View>
          </View>
        </Button>
        <Step
          icon={PlusIcon}
          label={i18n.t('timeForm_more', {
            duration: formatMinutesCompact(DURATION_STEP),
          })}
          disabled={total >= MAX_DURATION_HOURS * 60 + 59}
          onPress={() => setTotal(stepDuration(total, 1), 'stepper')}
        />
      </View>
      <View
        style={{ height: large ? 24 : 20 }}
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
      >
        {exact && (
          <Text
            numberOfLines={1}
            style={{
              textAlign: 'center',
              fontSize: theme.fontSize('sm'),
              fontFamily: theme.fonts.medium,
              color: theme.colors.textAlt,
            }}
          >
            {exact}
          </Text>
        )}
      </View>
      <View>
        <Presets
          value={total}
          onChange={(minutes) => setTotal(minutes, 'preset')}
        />
      </View>

      <PickerSheet
        open={picking}
        onCancel={() => setPicking(false)}
        onDone={() => {
          setPicking(false)
          props.setDuration(draftHours, draftMinutes)
          props.onInput?.('exact')
        }}
        doneTestID={`${props.testID}-picker-done`}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <WheelPicker
              data={wheel([...Array(MAX_DURATION_HOURS + 1).keys()])}
              value={draftHours}
              onValueChange={setDraftHours}
              accessibilityLabel={i18n.t('hours')}
              testID={`${props.testID}-duration-hours`}
            />
          </View>
          {unit(i18n.t('hours_lowercase'))}
          <View style={{ flex: 1 }}>
            <WheelPicker
              data={wheel([...Array(60).keys()])}
              value={draftMinutes}
              onValueChange={setDraftMinutes}
              accessibilityLabel={i18n.t('minutes')}
              testID={`${props.testID}-duration-minutes`}
            />
          </View>
          {unit(i18n.t('minutes_lowercase'))}
        </View>
      </PickerSheet>
    </View>
  )
}

export default DurationInput
