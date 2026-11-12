import { useState } from 'react'
import { Keyboard, View } from 'react-native'
import { Clock as ClockIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import PickerSheet from '@/components/ui/PickerSheet'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import WheelPicker from '@/components/ui/WheelPicker'
import FormRow, {
  FormRowDisclosure,
  FormRowLabel,
} from '@/components/ui/inputs/FormRow'
import useTheme from '@/contexts/theme'
import { alignText } from '@/lib/direction'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import {
  clockLabel,
  DAY_MINUTES,
  minutesOfDay,
  planTimeLabel,
} from '@/features/plans/lib/planTime'

export type PlanWhen = {
  anytime: boolean
  minutes: number
  startTimeInMinutes?: number
}

export type PlanStartTime = {
  anytime: boolean

  date: Date
  minutes: number
  setWhen: (when: PlanWhen) => void
}

const WHEEL_STEP = 5
const DEFAULT_SPAN_MINUTES = 60

const steps = (from: number, to: number, keep: number) => {
  const values: number[] = []
  for (let value = from; value <= to; value += WHEEL_STEP) values.push(value)
  if (keep >= from && keep <= to && !values.includes(keep)) {
    values.push(keep)
    values.sort((a, b) => a - b)
  }
  return values
}

const SpanWheels = (props: {
  start: number
  minutes: number
  onChange: (start: number, minutes: number) => void
}) => {
  const theme = useTheme()
  const { formatted: total } = useFormattedMinutes(props.minutes)
  const startItems = steps(0, DAY_MINUTES - WHEEL_STEP, props.start).map(
    (value) => ({ value, label: clockLabel(value) })
  )
  const endItems = steps(
    WHEEL_STEP,
    DAY_MINUTES - WHEEL_STEP,
    props.minutes
  ).map((value) => ({ value, label: clockLabel(props.start + value) }))
  const label = (text: string) => (
    <Text
      style={{
        textAlign: 'center',
        color: theme.colors.textAlt,
        fontFamily: theme.fonts.semiBold,
        fontSize: theme.fontSize('sm'),
      }}
    >
      {text}
    </Text>
  )
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          {label(i18n.t('planForm_start'))}
          <WheelPicker
            data={startItems}
            value={props.start}
            onValueChange={(start) => props.onChange(start, props.minutes)}
            accessibilityLabel={i18n.t('planForm_start')}
            testID='plan-span-start'
          />
        </View>
        <View style={{ flex: 1 }}>
          {label(i18n.t('planForm_end'))}
          <WheelPicker
            data={endItems}
            value={props.minutes}
            onValueChange={(minutes) => props.onChange(props.start, minutes)}
            accessibilityLabel={i18n.t('planForm_end')}
            testID='plan-span-end'
          />
        </View>
      </View>
      <Text
        testID='plan-span-total'
        style={{
          textAlign: 'center',
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.text,
        }}
      >
        {total}
      </Text>
    </View>
  )
}

const PlanStartTimeRow = (props: PlanStartTime & { first?: boolean }) => {
  const theme = useTheme()
  const [picking, setPicking] = useState(false)
  const [draftStart, setDraftStart] = useState(0)
  const [draftMinutes, setDraftMinutes] = useState(DEFAULT_SPAN_MINUTES)

  const value = props.anytime
    ? i18n.t('planAnytime')
    : planTimeLabel(props.date, props.minutes)

  const open = () => {
    Keyboard.dismiss()
    setDraftStart(minutesOfDay(props.date))
    setDraftMinutes(props.minutes || DEFAULT_SPAN_MINUTES)
    setPicking(true)
  }

  return (
    <>
      <FormRow
        icon={ClockIcon}
        first={props.first}
        onPress={open}
        accessibilityLabel={`${i18n.t('planForm_startTime')}, ${value}`}
        testID='plan-start-row'
        trailing={<FormRowDisclosure />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <FormRowLabel>{i18n.t('planForm_startTime')}</FormRowLabel>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: alignText('end'),
              fontFamily: props.anytime
                ? theme.fonts.regular
                : theme.fonts.semiBold,
              color: props.anytime ? theme.colors.textAlt : theme.colors.text,
            }}
          >
            {value}
          </Text>
        </View>
      </FormRow>
      <PickerSheet
        open={picking}
        onCancel={() => setPicking(false)}
        onDone={() => {
          setPicking(false)
          props.setWhen({
            anytime: false,
            minutes: draftMinutes,
            startTimeInMinutes: draftStart,
          })
        }}
        doneTestID='plan-start-done'
        title={i18n.t('planForm_startTime')}
      >
        <SpanWheels
          start={draftStart}
          minutes={draftMinutes}
          onChange={(start, minutes) => {
            setDraftStart(start)
            setDraftMinutes(minutes)
          }}
        />
        {!props.anytime && (
          <Button
            noTransform
            onPress={() => {
              setPicking(false)
              props.setWhen({ anytime: true, minutes: props.minutes })
            }}
            accessibilityRole='button'
            testID='plan-start-clear'
            style={{
              minHeight: MIN_TOUCH_TARGET,
              alignSelf: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                color: theme.colors.accent,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('planForm_noSetTime')}
            </Text>
          </Button>
        )}
      </PickerSheet>
    </>
  )
}

export default PlanStartTimeRow
