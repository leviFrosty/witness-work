import { useState, useRef, useEffect } from 'react'
import useServiceReport from '../stores/serviceReport'

const padStart = (num: number) => {
  return num.toString().padStart(2, '0')
}

const formatMs = (ms: number) => {
  let seconds = Math.floor(ms / 1000)
  let minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  // using the modulus operator gets the remainder if the time rolls over
  // we don't do this for hours because we want them to rollover
  // seconds = 81 -> minutes = 1, seconds = 21.
  // 60 minutes in an hour, 60 seconds in a minute, 1000 milliseconds in a second.
  seconds = seconds % 60
  minutes = minutes % 60

  return `${padStart(hours)}:${padStart(minutes)}:${padStart(seconds)}`
}

export const useStopWatch = () => {
  const [time, setTime] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [startTime, setStartTime] = useState<number>(0)
  const [timeWhenLastStopped, setTimeWhenLastStopped] = useState<number>(0)
  const [dataLoaded, setDataLoaded] = useState(false)
  const { persistedStopwatch, set } = useServiceReport()

  const interval = useRef<NodeJS.Timeout>()

  useEffect(() => {
    // Loads in persisted data from async storage
    setTimeWhenLastStopped(persistedStopwatch.timeWhenLastStopped)
    setIsRunning(persistedStopwatch.isRunning)
    setStartTime(persistedStopwatch.startTime)
    setDataLoaded(true)

    // Only load on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Persist the latest data to async storage to be used later, if needed
    const latestData = {
      timeWhenLastStopped,
      isRunning,
      startTime,
    }

    if (dataLoaded) {
      set({
        persistedStopwatch: latestData,
      })
    }
  }, [timeWhenLastStopped, isRunning, startTime, dataLoaded, set])

  useEffect(() => {
    // If the stopwatch is running, we want to update the time every second
    if (startTime > 0) {
      interval.current = setInterval(() => {
        setTime(() => Date.now() - startTime + timeWhenLastStopped)
      }, 5)
    } else {
      if (interval.current) {
        clearInterval(interval.current)
        interval.current = undefined
      }
    }
  }, [startTime, timeWhenLastStopped])

  const start = () => {
    setIsRunning(true)
    setStartTime(Date.now())
  }

  const stop = () => {
    setIsRunning(false)
    setStartTime(0)
    setTimeWhenLastStopped(time)
  }

  const reset = () => {
    setIsRunning(false)
    setStartTime(0)
    setTimeWhenLastStopped(0)
    setTime(0)
  }

  return {
    start,
    stop,
    reset,
    isRunning,
    time: formatMs(time),
    hasStarted: time > 0,
    dataLoaded,
  }
}
