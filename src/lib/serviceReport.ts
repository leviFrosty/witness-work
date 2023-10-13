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
