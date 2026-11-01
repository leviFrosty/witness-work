import { analytics } from '@/lib/analytics'
import { useEffect, useState } from 'react'
import * as Linking from 'expo-linking'
import { launchURL } from '@/lib/launchLinks'
import * as Crypto from 'expo-crypto'
import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import useAnimation from '@/hooks/useAnimation'
import { useIsTakingOver, useTakeoverHold } from '@/hooks/useTakeoverTurn'
import Haptics from '@/lib/haptics'
import { noteUserAction } from '@/lib/userAction'
import { measureReward } from '@/lib/actionRewards'
import { usePreferences } from '@/stores/preferences'
import { CONFETTI_DELAY_MS } from '@/providers/AnimationViewProvider'
import { getMonthsReports, isCountableEntry } from '@/lib/serviceReport'
import {
  isSharedGoodNewsUrl,
  navigationRef,
} from '@/features/contacts/lib/linking'
import { shouldForwardToSystem } from '@/features/contacts/lib/systemLinks'
import { TimeEntry } from '@/types/timeEntry'

export default function SharedGoodNewsListener() {
  const { playConfetti } = useAnimation()
  const onboarded = usePreferences((s) => s.onboardingComplete)
  const takingOver = useIsTakingOver()
  const [pending, setPending] = useState(false)
  const [retry, setRetry] = useState(0)
  useTakeoverHold('shared-good-news', pending)

  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return

      if (shouldForwardToSystem(url)) {
        Linking.openURL(url).catch(() => {})
        return
      }

      if (isSharedGoodNewsUrl(url)) setPending(true)
    }

    launchURL().then(handle)

    const sub = Linking.addEventListener('url', ({ url }) => handle(url))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!pending || !onboarded || takingOver) return

    if (!navigationRef.isReady()) {
      const timer = setTimeout(() => setRetry((count) => count + 1), 300)
      return () => clearTimeout(timer)
    }
    setPending(false)
    navigationRef.navigate('Root', { screen: 'Home' } as never, { pop: true })

    const { serviceReports } = useServiceReport.getState()
    const alreadyReported = getMonthsReports(
      serviceReports,
      moment().month(),
      moment().year()
    ).some(isCountableEntry)
    if (alreadyReported) return

    const report: TimeEntry = {
      date: new Date(),
      hours: 0,
      minutes: 0,
      id: Crypto.randomUUID(),
    }
    noteUserAction('checkbox')
    const earned = measureReward('checkbox')
    useServiceReport.getState().addServiceReport(report)
    earned()
    analytics.capture('time_entry_created', {
      source: 'widget',
      entry_mode: 'checkbox',
    })
    Haptics.heavy()
    setTimeout(() => Haptics.success(), CONFETTI_DELAY_MS + 100)
    playConfetti()
  }, [pending, onboarded, takingOver, retry, playConfetti])

  return null
}
