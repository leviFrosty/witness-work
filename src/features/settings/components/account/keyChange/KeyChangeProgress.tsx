import { ActivityIndicator, View } from 'react-native'
import {
  Circle as CircleIcon,
  CircleCheck as CircleCheckIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import type { KeyChangeStage } from '@/lib/accountKey/keyChangeRecord'
import i18n, { type TranslationKey } from '@/lib/locales'

const STEPS: { label: TranslationKey; doneAt: KeyChangeStage }[] = [
  { label: 'accountKeyChange_stageCommit', doneAt: 'committed' },
  { label: 'accountKeyChange_stageStore', doneAt: 'stored' },
  { label: 'accountKeyChange_stageReseal', doneAt: 'resealed' },
  { label: 'accountKeyChange_stageBuddies', doneAt: 'buddies-reset' },
]

const ORDER: KeyChangeStage[] = [
  'pending',
  'confirmed',
  'committed',
  'stored',
  'resealed',
  'buddies-reset',
]

export default function KeyChangeProgress({
  stage,
  confirming = false,
}: {
  stage: KeyChangeStage | null
  confirming?: boolean
}) {
  const theme = useTheme()
  const reached = stage ? ORDER.indexOf(stage) : -1
  const running = confirming
    ? -2
    : STEPS.findIndex((step) => ORDER.indexOf(step.doneAt) > reached)
  return (
    <View style={{ gap: 20 }} testID='key-change-progress'>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('xl'),
            fontFamily: theme.fonts.bold,
            textAlign: 'center',
          }}
        >
          {i18n.t(
            confirming
              ? 'accountKeyChange_confirming'
              : 'accountKeyChange_changing'
          )}
        </Text>
        <Text style={{ textAlign: 'center', color: theme.colors.textAlt }}>
          {i18n.t(
            confirming
              ? 'accountKeyChange_confirmingDetail'
              : 'accountKeyChange_changingDetail'
          )}
        </Text>
      </View>
      <View style={{ gap: 14 }}>
        {STEPS.map((step, index) => {
          const done = running === -1 || (running >= 0 && index < running)
          const active = index === running
          return (
            <View
              key={step.label}
              accessible
              accessibilityLabel={`${i18n.t(step.label)}, ${i18n.t(
                done
                  ? 'accountKeyChange_stageDone'
                  : active
                    ? 'accountKeyChange_stageRunning'
                    : 'accountKeyChange_stageWaiting'
              )}`}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}
            >
              <View
                style={{ width: 24, alignItems: 'center' }}
                importantForAccessibility='no-hide-descendants'
              >
                {active ? (
                  <ActivityIndicator size='small' />
                ) : (
                  <LucideIcon
                    icon={done ? CircleCheckIcon : CircleIcon}
                    size={22}
                    color={done ? theme.colors.accent : theme.colors.textAlt}
                  />
                )}
              </View>
              <Text
                style={{
                  flex: 1,
                  color:
                    done || active ? theme.colors.text : theme.colors.textAlt,
                  fontFamily: active ? theme.fonts.semiBold : undefined,
                }}
              >
                {i18n.t(step.label)}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
