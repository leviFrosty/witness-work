/**
 * Which sync setup the photo jobs belong to. A photo pass records it when it
 * starts and stops transferring, and writing its bookkeeping and records, once
 * it changes: the pass listed, downloaded and judged everything against the
 * setup it began under, and a switch of sync option, leaving or resetting the
 * account, or a changed account key has since replaced that setup's
 * bookkeeping. Photo passes outlive the pull or push that starts them, and
 * `waitForSyncIdle` doesn't wait for them, so without it a slow transfer would
 * write the old setup's results over the new one's
 * (docs/cloud-sync-photos.md).
 */
let epoch = 0

export const photoEpoch = (): number => epoch

/** Ends the photo passes running now; the next ones start under a new setup. */
export const endPhotoPasses = (): void => {
  epoch++
}
