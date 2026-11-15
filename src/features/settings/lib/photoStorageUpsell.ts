export type PhotoStorageUpsellStatus = 'almost_full' | 'full'

export const upsellDismissed = (
  dismissed: PhotoStorageUpsellStatus | null,
  status: PhotoStorageUpsellStatus
) => dismissed === 'full' || dismissed === status
