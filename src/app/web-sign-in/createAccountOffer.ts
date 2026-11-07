export function createAccountOffer({
  dev,
  keptData,
  withoutAccount,
}: {
  dev: boolean
  keptData: boolean
  withoutAccount: boolean
}): { offered: boolean; open: boolean } {
  return { offered: !keptData, open: dev && !keptData && withoutAccount }
}
