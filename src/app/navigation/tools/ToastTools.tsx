import { useState } from 'react'
import {
  MessageSquare as MessageSquareIcon,
  PartyPopper as PartyPopperIcon,
} from 'lucide-react-native'
import ChoiceChips from '@/components/ui/ChoiceChips'
import LucideIcon from '@/components/ui/LucideIcon'
import TextInput from '@/components/ui/TextInput'
import useTheme from '@/contexts/theme'
import {
  toast,
  toastPlacement,
  useRecentToasts,
  useToasts,
  type Toast,
  type ToastInput,
  type ToastIntent,
} from '@/stores/toasts'
import {
  ToolList,
  ToolRow,
  ToolSection,
  ToolSubheading,
} from '@/app/navigation/tools/ToolsUI'

const INTENTS: ToastIntent[] = [
  'success',
  'info',
  'error',
  'undo',
  'news',
  'unlock',
]
/** Time on screen; `default` leaves the intent's own. */
const DURATIONS = ['default', '3s', '10s', '60s'] as const
type Duration = (typeof DURATIONS)[number]

const unlockArt = (size: number) => (
  <LucideIcon icon={PartyPopperIcon} size={size} />
)

/** Shows a toast of `intent` with test callbacks that touch nothing. */
const showToast = (intent: ToastIntent, input: ToastInput) => {
  const { title, ...rest } = input
  switch (intent) {
    case 'undo':
      return toast.undo({
        ...input,
        onUndo: () => toast.info('Undo pressed'),
      })
    case 'unlock':
      return toast.unlock({
        eyebrow: 'Test unlock',
        art: unlockArt,
        onOpen: () => toast.info('Unlock opened'),
        ...input,
      })
    default:
      return toast[intent](title, rest)
  }
}

/**
 * Shows it again without the original's callbacks and key, so a replay can't
 * settle tray news, undo a real change, or replace a live toast by its key.
 */
const replay = ({
  intent,
  title,
  message,
  icon,
  eyebrow,
  art,
  onOpen,
  durationMs,
}: Toast) =>
  showToast(intent, { title, message, icon, eyebrow, art, onOpen, durationMs })

/** A few of `intent`, a beat apart, to watch them stack. */
const burst = (intent: ToastIntent, count = 3) => {
  for (let i = 1; i <= count; i++) {
    setTimeout(
      () =>
        showToast(intent, {
          title: `${intent} ${i}`,
          message: `Sample message ${i}`,
        }),
      (i - 1) * 400
    )
  }
}

/**
 * Developer Tools: shows custom toasts, bursts for the stacks at each edge, and
 * replays recent ones, for testing the toast host (`docs/toasts.md`).
 */
export default function ToastTools() {
  const theme = useTheme()
  const showing = useToasts((state) => state.toasts)
  const recent = useRecentToasts((state) => state.recent)
  const [intent, setIntent] = useState<ToastIntent>('success')
  const [duration, setDuration] = useState<Duration>('default')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')

  const top = showing.filter((t) => toastPlacement(t.intent) === 'top').length
  const inputStyle = {
    minHeight: 40,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.numbers.borderRadiusSm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: theme.colors.text,
  }

  return (
    <ToolSection
      title='Toasts'
      icon={MessageSquareIcon}
      info='Shows test toasts. Undo and unlock buttons only show another toast. Replays drop the original callbacks and key, so they never settle tray news or undo anything.'
      summary={`${top} top · ${showing.length - top} bottom`}
    >
      <ToolSubheading title='Custom' />
      <ChoiceChips
        accessibilityLabel='Toast intent'
        options={INTENTS.map((key) => ({ key, label: key }))}
        value={intent}
        onChange={setIntent}
        style={{ paddingTop: 8 }}
      />
      <ChoiceChips
        accessibilityLabel='Toast duration'
        options={DURATIONS.map((key) => ({ key, label: key }))}
        value={duration}
        onChange={setDuration}
        style={{ paddingTop: 8 }}
      />
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={`Title (default: Test ${intent})`}
        accessibilityLabel='Toast title'
        textAlign='start'
        style={[inputStyle, { marginTop: 8 }]}
      />
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder='Message (optional)'
        accessibilityLabel='Toast message'
        textAlign='start'
        style={[inputStyle, { marginTop: 8 }]}
      />
      <ToolList>
        <ToolRow
          label='Show'
          onPress={() =>
            showToast(intent, {
              title: title.trim() || `Test ${intent}`,
              message: message.trim() || undefined,
              durationMs:
                duration === 'default'
                  ? undefined
                  : Number.parseInt(duration, 10) * 1000,
            })
          }
        />
      </ToolList>

      <ToolSubheading title='Stacks' />
      <ToolList>
        <ToolRow label='3 at the top (news)' onPress={() => burst('news')} />
        <ToolRow
          label='3 at the bottom (success)'
          onPress={() => burst('success')}
        />
        <ToolRow label='3 unlocks' onPress={() => burst('unlock')} />
        <ToolRow
          label='One of each intent'
          onPress={() =>
            INTENTS.forEach((each, i) =>
              setTimeout(
                () => showToast(each, { title: `Test ${each}` }),
                i * 300
              )
            )
          }
        />
        <ToolRow
          label='Dismiss all'
          tone='destructive'
          disabled={showing.length === 0}
          onPress={() => showing.forEach((t) => toast.dismiss(t.id))}
        />
      </ToolList>

      <ToolSubheading
        title='Recent'
        info='The last toasts shown since launch, newest first. Tap one to show it again.'
      />
      <ToolList>
        {recent.length === 0 ? (
          <ToolRow label='None yet' value='—' />
        ) : (
          recent.map((t) => (
            <ToolRow
              key={t.id}
              label={t.title}
              value={t.intent}
              onPress={() => replay(t)}
            />
          ))
        )}
        <ToolRow
          label='Replay all'
          disabled={recent.length === 0}
          onPress={() =>
            [...recent]
              .reverse()
              .forEach((t, i) => setTimeout(() => replay(t), i * 300))
          }
        />
      </ToolList>
    </ToolSection>
  )
}
