export type MileageExportResult = 'copied' | 'shared' | 'dismissed'

/** Completion is the native action result, never a report submission flag. */
export async function exportMileageSummary(
  text: string,
  method: 'copy' | 'share',
  actions: {
    copy: (text: string) => Promise<unknown>
    share: (text: string) => Promise<'shared' | 'dismissed'>
  }
): Promise<MileageExportResult> {
  if (method === 'copy') {
    await actions.copy(text)
    return 'copied'
  }
  return actions.share(text)
}
