/** `current` with `ids` picked too, in the order they were picked. */
export const addPicks = (current: string[], ids: string[]) => {
  const fresh = ids.filter((id) => !current.includes(id))
  return fresh.length > 0 ? [...current, ...fresh] : current
}

/** Picks every Contact in a pin, or puts them all back if they were. */
export const togglePicks = (current: string[], ids: string[]) =>
  ids.every((id) => current.includes(id))
    ? current.filter((id) => !ids.includes(id))
    : addPicks(current, ids)

/**
 * The picks on the map now. A pick the search or the filters hide stays picked,
 * but isn't shown, counted or planned until it's back.
 */
export const picksInView = (
  picks: string[],
  contacts: readonly { id: string }[]
): ReadonlySet<string> => {
  const picked = new Set(picks)
  return new Set(
    contacts.filter((contact) => picked.has(contact.id)).map(({ id }) => id)
  )
}

/** How many stops a planned route got, for analytics, in coarse buckets. */
export const stopCountBucket = (count: number) =>
  count <= 1 ? '1' : count <= 5 ? '2-5' : count <= 10 ? '6-10' : '11+'
