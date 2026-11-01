import { useState } from 'react'
import { Flame as FlameIcon } from 'lucide-react-native'
import ChoiceChips from '@/components/ui/ChoiceChips'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import { useRecordedServiceStreak } from '@/hooks/useServiceStreak'
import { toAsciiDigits } from '@/lib/digits'
import { usePreferences } from '@/stores/preferences'
import { ToolList, ToolRow, ToolSection } from '@/app/navigation/tools/ToolsUI'

const PRESETS = ['off', '0', '3', '5', '9', '30', '120'] as const

const MAX_DIGITS = 4

export default function StreakTools() {
  const theme = useTheme()
  const recorded = useRecordedServiceStreak()
  const override = usePreferences((state) => state.devStreakOverride)
  const set = (value: number | null) =>
    usePreferences.getState().set({ devStreakOverride: value })
  const [input, setInput] = useState('')
  const kind = recorded.kind === 'plans' ? 'planned days' : 'months'

  const apply = () => {
    const value = Number.parseInt(input, 10)
    if (Number.isFinite(value)) set(value)
    setInput('')
  }

  return (
    <ToolSection
      title='Streak'
      icon={FlameIcon}
      info='Replaces the Service Streak count on Home, Progress and the profile. The pet no longer reads it: its lamp follows its hearts, and the Shop sells its items. Reminders, Buddy Cards and widgets keep the recorded streak. This device only.'
      summary={
        override === null
          ? `${recorded.count} ${kind}`
          : `Override ${override} (recorded ${recorded.count})`
      }
    >
      <ToolList>
        <ToolRow label='Recorded' value={`${recorded.count} ${kind}`} />
        <ToolRow
          label='Override'
          value={override === null ? 'off' : `${override}`}
        />
        <ToolRow
          label='Set count'
          info='A whole number; applies when you press Done.'
          trailing={
            <TextInput
              value={input}
              placeholder={override === null ? '–' : `${override}`}
              onChangeText={(value) =>
                setInput(toAsciiDigits(value).replace(/[^0-9]/g, ''))
              }
              onSubmitEditing={apply}
              inputMode='numeric'
              enterKeyHint='done'
              selectTextOnFocus
              textAlign='center'
              maxLength={MAX_DIGITS}
              accessibilityLabel='Streak count'
              style={{
                width: 80,
                minHeight: 36,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: theme.numbers.borderRadiusSm,
                paddingVertical: 6,
                paddingHorizontal: 10,
                color: theme.colors.text,
              }}
            />
          }
        />
      </ToolList>
      <ChoiceChips
        accessibilityLabel='Streak override presets'
        options={PRESETS.map((key) => ({ key, label: key }))}
        value={override === null ? 'off' : `${override}`}
        onChange={(key) => set(key === 'off' ? null : Number(key))}
        style={{ paddingTop: 8 }}
      />
    </ToolSection>
  )
}
