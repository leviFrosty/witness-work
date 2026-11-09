import type { ReactNode } from 'react'
import { View } from 'react-native'
import {
  Circle as CircleIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RoutineHabit } from '@/types/routine'
import HabitIcon from '@/features/routine/components/HabitIcon'

const ROW_MIN_HEIGHT = MIN_TOUCH_TARGET + 8
const CHECK_WIDTH = MIN_TOUCH_TARGET + 16

function CheckMark({ done }: { done: boolean }) {
  const theme = useTheme()
  return (
    <LucideIcon
      icon={done ? CircleCheckIcon : CircleIcon}
      size={26}
      color={done ? theme.colors.accent : theme.colors.textAlt}
    />
  )
}

function Labels({
  habit,
  caption,
  label,
  detail,
  done,
}: {
  habit?: RoutineHabit
  caption?: string
  label: string
  detail?: string
  done: boolean
}) {
  const theme = useTheme()
  const small = {
    fontSize: theme.fontSize('sm'),
    color: theme.colors.textAlt,
  }
  return (
    <>
      {habit ? <HabitIcon habit={habit} muted={done} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        {caption ? <Text style={small}>{caption}</Text> : null}
        <Text
          style={{
            fontSize: theme.fontSize('md'),
            fontFamily: theme.fonts.semiBold,
            color: done ? theme.colors.textAlt : theme.colors.text,
          }}
        >
          {label}
        </Text>
        {detail ? <Text style={small}>{detail}</Text> : null}
      </View>
    </>
  )
}

export default function RoutineHabitRow({
  habit,
  caption,
  label,
  detail,
  done,
  onToggle,
  onOpen,
  checkLabel,
  trailing,
  testID,
}: {
  habit?: RoutineHabit
  caption?: string
  label: string
  detail?: string
  done: boolean
  onToggle: () => void

  onOpen?: () => void

  checkLabel?: string
  trailing?: ReactNode
  testID?: string
}) {
  const spoken = [caption, label, detail].filter(Boolean).join(', ')
  const checkbox = {
    accessibilityRole: 'checkbox' as const,
    accessibilityState: { checked: done },
    accessibilityHint: i18n.t(
      done ? 'routine.home.uncheckHint' : 'routine.home.checkHint'
    ),
  }
  const labels = (
    <Labels
      habit={habit}
      caption={caption}
      label={label}
      detail={detail}
      done={done}
    />
  )
  if (!onOpen)
    return (
      <Button
        {...checkbox}
        onPress={onToggle}
        testID={testID}
        accessibilityLabel={spoken}
        style={{
          minHeight: ROW_MIN_HEIGHT,
          paddingHorizontal: 20,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {labels}
        {trailing}
        <CheckMark done={done} />
      </Button>
    )
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <Button
        onPress={onOpen}
        testID={testID}
        accessibilityRole='button'
        accessibilityLabel={spoken}
        accessibilityHint={i18n.t('routine.home.openHint')}
        style={{
          flex: 1,
          minHeight: ROW_MIN_HEIGHT,
          paddingStart: 20,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {labels}
        {trailing}
      </Button>
      <Button
        {...checkbox}
        onPress={onToggle}
        testID={testID ? `${testID}-check` : undefined}
        accessibilityLabel={checkLabel ?? label}
        style={{
          width: CHECK_WIDTH,
          minHeight: ROW_MIN_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CheckMark done={done} />
      </Button>
    </View>
  )
}
