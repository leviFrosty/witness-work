import throttle from 'lodash.throttle';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A custom hook that handles the state for the timer
 */
const useTimer = (initialTimeInMs = 0, onFinish = () => null) => {
  const [elapsedInMs, setElapsedInMs] = useState(0);
  const startTime = useRef<number | null>(null);
  const pausedTime = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timer | null>(null);
  const throttledOnFinish = useMemo(
    () => throttle(onFinish, 100, { trailing: false }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    // Ensure that the timer is reset when the initialTimeInMs changes
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTimeInMs]);

  useEffect(() => {
    // Checking if it's a timer and it reached 0
    if (initialTimeInMs > 0 && elapsedInMs >= initialTimeInMs) {
      removeInterval();
      setElapsedInMs(initialTimeInMs);
      throttledOnFinish();
    }
  }, [elapsedInMs, initialTimeInMs, throttledOnFinish]);

  function getSnapshot() {
    return Math.abs(initialTimeInMs - elapsedInMs);
  }

  function play() {
    // Already playing, returning early
    if (intervalId.current) {
      return;
    }
    // Timer mode and it reached 0, returning early
    if (elapsedInMs === initialTimeInMs && initialTimeInMs > 0) {
      return;
    }
    // First time playing, recording the start time
    if (!startTime.current) {
      startTime.current = Date.now();
      setHasStarted(true);
    }

    intervalId.current = setInterval(() => {
      if (!pausedTime.current) {
        setElapsedInMs(Date.now() - startTime.current!);
      } else {
        // If the timer is paused, we need to update the start time
        const elapsedSincePaused = Date.now() - pausedTime.current;
        startTime.current! += elapsedSincePaused;
        pausedTime.current = null;
      }
    }, 16);

    setIsRunning(true);
  }

  function resetState() {
    setElapsedInMs(0);
    startTime.current = null;
    pausedTime.current = null;
    setIsRunning(false);
    setHasStarted(false);
  }

  function removeInterval() {
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
  }

  function pause() {
    removeInterval();
    if (!pausedTime.current && elapsedInMs > 0) {
      pausedTime.current = Date.now();
    }
    setIsRunning(false);
    return getSnapshot();
  }

  function reset() {
    removeInterval();
    resetState();
  }

  // const countInSeconds = Math.floor(getSnapshot() / 1000);
  let seconds = Math.floor(getSnapshot() / 1000);
  let minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  // using the modulus operator gets the remainder if the time roles over
  // we don't do this for hours because we want them to rollover
  // seconds = 81 -> minutes = 1, seconds = 21.
  // 60 minutes in an hour, 60 seconds in a minute, 1000 milliseconds in a second.
  minutes %= 60;
  seconds %= 60;

  const padStart = (num: number) => {
    return num.toString().padStart(2, '0');
  };

  const formattedTime = `${padStart(hours)}:${padStart(minutes)}:${padStart(
    seconds,
  )}`;

  return {
    seconds,
    minutes,
    hours,
    formattedTime,
    isRunning,
    hasStarted,
    play,
    pause,
    reset,
    getSnapshot,
  };
};

export default useTimer;
