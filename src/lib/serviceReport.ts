import { ServiceReport } from "../types/serviceReport";
import moment from "moment";

export const calculateProgress = ({
  hours,
  goalHours,
}: {
  hours: number;
  goalHours: number;
}) => {
  return hours / goalHours < 0
    ? 0
    : hours / goalHours <= 1
    ? hours / goalHours
    : 1; // Does not allow percent less than 0 and greater than 1
};

export const calculateHoursRemaining = ({
  hours,
  goalHours,
}: {
  hours: number;
  goalHours: number;
}) => {
  const remaining = goalHours - hours;
  return remaining < 0 ? 0 : remaining > goalHours ? goalHours : remaining;
};

// Written by chat-gpt
export const getTotalHours = (serviceReports: ServiceReport[]): number => {
  const totalMinutes = serviceReports.reduce((accumulator, report) => {
    return accumulator + report.hours * 60 + report.minutes; // Convert hours to minutes and accumulate
  }, 0);

  const totalHoursRoundedDown = Math.floor(totalMinutes / 60); // Convert total minutes back to hours and round down

  return totalHoursRoundedDown;
};

// Written by chat-gpt
export const getTotalHoursForMonth = (
  serviceReports: ServiceReport[]
): number => {
  const currentMonth = moment().month(); // Get the current month (0-indexed)

  const totalMinutesForMonth = serviceReports
    .filter((report) => moment(report.date).month() === currentMonth)
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes;
    }, 0);

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60);

  return totalHoursRoundedDown;
};
