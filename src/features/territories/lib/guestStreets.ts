export function findGuestStreets<T extends { name: string }>(
  streets: readonly T[],
  query: string
): T[] {
  const wanted = query.trim().toLocaleLowerCase()
  const starts = (street: T) =>
    street.name.toLocaleLowerCase().startsWith(wanted)
  return streets
    .filter((street) => street.name.toLocaleLowerCase().includes(wanted))
    .sort(
      (a, b) =>
        (wanted ? Number(starts(b)) - Number(starts(a)) : 0) ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
    )
}
