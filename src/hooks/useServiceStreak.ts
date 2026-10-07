import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import moment from 'moment'
import usePublisher from '@/hooks/usePublisher'
import { serviceStreak, type ServiceStreak } from '@/lib/serviceStreak'
import { useServiceReport } from '@/stores/serviceReport'

/** Today, moved on at midnight and on returning to the app. */
function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const midnight = setTimeout(
      () => setToday(new Date()),
      moment(today).add(1, 'day').startOf('day').diff(moment()) + 1000
    )
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !moment().isSame(today, 'day'))
        setToday(new Date())
    })
    return () => {
      clearTimeout(midnight)
      subscription.remove()
    }
  }, [today])

  return today
}

/**
 * The User's Service Streak: planned days kept, or months in service for the
 * Kingdom Publisher (`streakKind`).
 */
export default function useServiceStreak(): ServiceStreak {
  const serviceReports = useServiceReport((state) => state.serviceReports)
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const { streakKind } = usePublisher()
  const today = useToday()
  return serviceStreak(
    streakKind,
    { serviceReports, dayPlans, recurringPlans },
    today
  )
}
