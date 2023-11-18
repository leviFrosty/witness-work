import { ServiceReport } from "../types/serviceReport";
import moment from "moment";

export const calculateProgress = ({
  hours,
  goalHours,
}: {
  hours: number;
  goalHours: number;
}) => {
  const percentage = hours / goalHours;
  return percentage < 0 ? 0 : percentage <= 1 ? percentage : 1;
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

export const getTotalHours = (serviceReports: ServiceReport[]): number => {
  const totalMinutes = serviceReports.reduce((accumulator, report) => {
    return accumulator + report.hours * 60 + report.minutes; // Convert hours to minutes and accumulate
  }, 0);

  const totalHoursRoundedDown = Math.floor(totalMinutes / 60); // Convert total minutes back to hours and round down

  return totalHoursRoundedDown;
};

export const totalHoursForCurrentMonth = (
  serviceReports: ServiceReport[]
): number => {
  const currentMonth = moment().month();
  const currentYear = moment().year();

  const totalMinutesForMonth = serviceReports
    .filter(
      (report) =>
        moment(report.date).month() === currentMonth &&
        moment(report.date).year() === currentYear
    )
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
  const hasReportsForMonth = serviceReports.some(
    (report) => moment(report.date).month() === month
  );

  return hasReportsForMonth;
};
