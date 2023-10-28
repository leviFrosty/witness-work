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
export const totalHoursForCurrentMonth = (
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

export const totalHoursForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes;
    }, 0);

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60);

  return totalHoursRoundedDown;
};

export const ldcHoursForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear &&
        report.ldc
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes;
    }, 0);

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60);

  return totalHoursRoundedDown;
};

export const nonLdcHoursForSpecificMonth = (
  serviceReports: ServiceReport[],
  targetMonth: number,
  targetYear: number
): number => {
  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === targetMonth &&
        moment(report.date).year() === targetYear &&
        !report.ldc
    )
    .reduce((accumulator, report) => {
      return accumulator + report.hours * 60 + report.minutes;
    }, 0);

  const totalHoursRoundedDown = Math.floor(totalMinutesForMonth / 60);

  return totalHoursRoundedDown;
};

export const hasServiceReportsForMonth = (
  serviceReports: ServiceReport[],
  month: number
): boolean => {
  // Check if there are any service reports for the current month
  const hasReportsForMonth = serviceReports.some(
    (report) => moment(report.date).month() === month
  );

  return hasReportsForMonth;
};
