import * as FileSystem from 'expo-file-system/legacy'

export type PickedFile = { uri: string; file?: Blob }

export async function readPickedText(
  { uri, file }: PickedFile,
  options?: { length?: number }
): Promise<string> {
  if (file)
    return (options?.length ? file.slice(0, options.length) : file).text()
  return options?.length
    ? FileSystem.readAsStringAsync(uri, { position: 0, length: options.length })
    : FileSystem.readAsStringAsync(uri)
}
