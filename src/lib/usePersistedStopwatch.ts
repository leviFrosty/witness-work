// copied from https://github.com/ReactNativeSchool/expo-clock-app/blob/main/src/hooks/useStopWatch.ts
import { useState, useRef, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type LapData = {
  time: string;
  lap: number;
};

const padStart = (num: number) => {
  return num.toString().padStart(2, "0");
};

const formatMs = (milliseconds: number) => {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);

  // using the modulus operator gets the remainder if the time roles over
  // we don't do this for hours because we want them to rollover
  // seconds = 81 -> minutes = 1, seconds = 21.
  // 60 minutes in an hour, 60 seconds in a minute, 1000 milliseconds in a second.
  minutes = minutes % 60;
  seconds = seconds % 60;

  let str = `${padStart(hours)}:${padStart(minutes)}:${padStart(seconds)}`;

  return str;
};

const ASYNC_KEYS = {
  timeWhenLastStopped: "useStopWatch::timeWhenLastStopped",
  isRunning: "useStopWatch::isRunning",
  startTime: "useStopWatch::startTime",
  laps: "useStopWatch::laps",
};

export const usePersistedStopWatch = () => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [timeWhenLastStopped, setTimeWhenLastStopped] = useState<number>(0);
  const [laps, setLaps] = useState<number[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const interval = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // load data from async storage in case app was quit
    const loadData = async () => {
      try {
        const persistedValues = await AsyncStorage.multiGet([
          ASYNC_KEYS.timeWhenLastStopped,
          ASYNC_KEYS.isRunning,
          ASYNC_KEYS.startTime,
          ASYNC_KEYS.laps,
        ]);

        const [
          persistedTimeWhenLastStopped,
          persistedIsRunning,
          persistedStartTime,
          persistedLaps,
        ] = persistedValues;

        setTimeWhenLastStopped(
          persistedTimeWhenLastStopped[1]
            ? parseInt(persistedTimeWhenLastStopped[1])
            : 0
        );
        setIsRunning(persistedIsRunning[1] === "true");
        setStartTime(
          persistedStartTime[1] ? parseInt(persistedStartTime[1]) : 0
        );
        setLaps(persistedLaps[1] ? JSON.parse(persistedLaps[1]) : []);
        setDataLoaded(true);
      } catch (e) {
        console.log("error loading persisted data", e);
        setDataLoaded(true);
      }
    };

    loadData();
  }, []);

  useEffect(() => {
    // persist the latest data to async storage to be used later, if needed
    const persist = async () => {
      try {
        await AsyncStorage.multiSet([
          [ASYNC_KEYS.timeWhenLastStopped, timeWhenLastStopped.toString()],
          [ASYNC_KEYS.isRunning, isRunning.toString()],
          [ASYNC_KEYS.startTime, startTime.toString()],
          [ASYNC_KEYS.laps, JSON.stringify(laps)],
        ]);
      } catch (e) {
        console.log("error persisting data");
      }
    };

    if (dataLoaded) {
      persist();
    }
  }, [timeWhenLastStopped, isRunning, startTime, laps, dataLoaded]);

  useEffect(() => {
    if (startTime > 0) {
      interval.current = setInterval(() => {
        setTime(() => Date.now() - startTime + timeWhenLastStopped);
      }, 1);
    } else {
      if (interval.current) {
        clearInterval(interval.current);
        interval.current = undefined;
      }
    }
  }, [startTime]);

  const start = () => {
    setIsRunning(true);
    setStartTime(Date.now());
  };

  const stop = () => {
    setIsRunning(false);
    setStartTime(0);
    setTimeWhenLastStopped(time);
  };

  const reset = () => {
    setIsRunning(false);
    setStartTime(0);
    setTimeWhenLastStopped(0);
    setTime(0);
    setLaps([]);
  };

  const lap = () => {
    setLaps((laps) => [time, ...laps]);
  };

  let slowestLapTime: number | undefined;
  let fastestLapTime: number | undefined;

  const formattedLapData: LapData[] = laps.map((l, index) => {
    const previousLap = laps[index + 1] || 0;
    const lapTime = l - previousLap;

    if (!slowestLapTime || lapTime > slowestLapTime) {
      slowestLapTime = lapTime;
    }

    if (!fastestLapTime || lapTime < fastestLapTime) {
      fastestLapTime = lapTime;
    }

    return {
      time: formatMs(lapTime),
      lap: laps.length - index,
    };
  });

  return {
    start,
    stop,
    reset,
    lap,

    isRunning,
    time: formatMs(time),

    laps: formattedLapData,
    currentLapTime: laps[0] ? formatMs(time - laps[0]) : formatMs(time),
    hasStarted: time > 0,
    slowestLapTime: formatMs(slowestLapTime || 0),
    fastestLapTime: formatMs(fastestLapTime || 0),

    dataLoaded,
  };
};
