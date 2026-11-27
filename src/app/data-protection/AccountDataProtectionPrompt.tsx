import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import { askToFollowAccount } from '@/app/data-protection/askToFollowAccount'
import { arrivedSoonAfterOpening } from '@/app/data-protection/followTiming'
import useTakeoverTurn from '@/hooks/useTakeoverTurn'
import { analytics } from '@/lib/analytics'
import { accountDataProtectionChange } from '@/lib/dataProtectionAccount'
import { usePreferences } from '@/stores/preferences'

export default function AccountDataProtectionPrompt() {
  const onboardingComplete = usePreferences((s) => s.onboardingComplete)
  const change = usePreferences(useShallow(accountDataProtectionChange))
  const asking = onboardingComplete && change.kind === 'ask'
  const askOn = change.kind === 'ask' ? change.on : null
  const askAt = change.kind === 'ask' ? change.at : null
  const settleAt = change.kind === 'settle' ? change.at : null

  useEffect(() => {
    if (settleAt !== null)
      usePreferences.getState().answerAccountDataProtection(true)
  }, [settleAt])

  const openedAt = useRef(Date.now())
  const askingNow = useRef(asking)
  const [due, setDue] = useState(false)
  useEffect(() => {
    askingNow.current = asking
    if (!asking) setDue(false)
    else if (arrivedSoonAfterOpening(openedAt.current, Date.now())) setDue(true)
  }, [asking])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      openedAt.current = Date.now()
      if (askingNow.current) setDue(true)
    })
    return () => subscription.remove()
  }, [])

  const turn = useTakeoverTurn('data-protection-follow', asking && due)
  const shownFor = useRef<number | null>(null)
  useEffect(() => {
    if (!turn.active || askOn === null || shownFor.current === askAt) return
    shownFor.current = askAt
    const direction = askOn ? 'on' : 'off'
    analytics.capture('data_protection_follow_shown', { change: direction })
    askToFollowAccount(askOn, ({ follow, step }) => {
      usePreferences.getState().answerAccountDataProtection(follow)
      analytics.capture('data_protection_follow_answered', {
        change: direction,
        outcome: follow ? 'followed' : 'opted_out',
        step,
      })
    })
  }, [turn.active, askOn, askAt])

  return null
}
