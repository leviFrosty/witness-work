import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import moment from 'moment'

/** Today, moved on at midnight and on returning to the app. */
export default function useToday(): Date {
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
