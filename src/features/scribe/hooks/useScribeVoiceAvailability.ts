import { useEffect, useState } from 'react'
import * as Speech from '../../../../modules/speech-transcription'
import { usePreferences } from '@/stores/preferences'
import type { ScribeVoiceAvailability } from '@/features/scribe/types'
import { speechLocaleCandidates } from '@/features/scribe/lib/locale'

const answers = new Map<string, ScribeVoiceAvailability>()
const checks = new Map<string, Promise<ScribeVoiceAvailability>>()

function check(key: string): Promise<ScribeVoiceAvailability> {
  const running = checks.get(key)
  if (running) return running
  const pending = Speech.getAvailability(speechLocaleCandidates())
    .then((result): ScribeVoiceAvailability => {
      const answer = result.available ? 'available' : 'unsupported'
      answers.set(key, answer)
      return answer
    })
    .catch((): ScribeVoiceAvailability => 'unsupported')
    .finally(() => checks.delete(key))
  checks.set(key, pending)
  return pending
}

export function useScribeVoiceAvailability(): ScribeVoiceAvailability {
  const supported = Speech.isSupported()
  const key = usePreferences((state) => state.locale) ?? 'device'
  const [checked, setChecked] = useState<{
    key: string
    value: ScribeVoiceAvailability
  } | null>(null)

  useEffect(() => {
    if (!supported || answers.has(key)) return
    let current = true
    void check(key).then((value) => {
      if (current) setChecked({ key, value })
    })
    return () => {
      current = false
    }
  }, [supported, key])

  if (!supported) return 'unsupported'
  return answers.get(key) ?? (checked?.key === key ? checked.value : 'checking')
}
