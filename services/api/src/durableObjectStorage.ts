/**
 * Frees a SQLite Durable Object's storage with `deleteAll()` (all or
 * nothing), then runs `afterDeleteAll` and `restore` (in a transaction) to
 * put back what must outlive it, such as an alarm and a tombstone. All of it
 * runs inside `blockConcurrencyWhile`, so no other event sees the storage
 * without what they write.
 *
 * If any step fails, the callback rejects and workerd resets the object:
 * this call rejects, so does the request it served, and the next event
 * meets a fresh instance. A failed `deleteAll()` leaves the storage as it
 * was; a failure after it leaves only what was put back before the failure.
 * `deleteAll()` keeps the alarm only before compatibility date 2026-02-24,
 * so an object whose retry rests on its alarm sets it again in
 * `afterDeleteAll` (Shared Spaces does).
 */
export const deleteAllThen = async (
  ctx: DurableObjectState,
  {
    afterDeleteAll,
    restore,
  }: {
    afterDeleteAll?: () => Promise<void>
    restore?: () => void
  } = {}
): Promise<void> => {
  await ctx.blockConcurrencyWhile(async () => {
    await ctx.storage.deleteAll()
    if (afterDeleteAll) await afterDeleteAll()
    if (restore) ctx.storage.transactionSync(restore)
  })
}

/** Rows `readSeqPage` reads per query unless told otherwise. */
export const SEQ_PAGE_CHUNK = 64

/**
 * A page of rows in `seq` order after `since`, read `chunk` rows at a time
 * with `toArray()`, until `take` turns a row down or they run out; `more`
 * says `take` turned one down. `read(after, count)` returns up to `count`
 * rows with `seq > after`, in `seq` order. Rows `keep` turns down are
 * skipped, as if they weren't there (Shared Spaces leaves out records the
 * caller may not read).
 *
 * Why chunks: a page that stops early must not leave its `exec()` cursor
 * unfinished. An open cursor keeps its statement running, and SQLite then
 * refuses to drop the table it reads (`SQLITE_LOCKED`) until the object is
 * evicted. Every chunk is read whole, so no cursor stays open.
 */
export const readSeqPage = <T extends { seq: number }>(
  read: (after: number, count: number) => T[],
  since: number,
  take: (row: T, taken: readonly T[]) => boolean,
  chunk: number = SEQ_PAGE_CHUNK,
  keep: (row: T) => boolean = () => true
): { rows: T[]; more: boolean } => {
  const rows: T[] = []
  let after = since
  for (;;) {
    const batch = read(after, chunk)
    for (const row of batch) {
      if (!keep(row)) continue
      if (!take(row, rows)) return { rows, more: true }
      rows.push(row)
    }
    if (batch.length < chunk) return { rows, more: false }
    after = batch[batch.length - 1].seq
  }
}
