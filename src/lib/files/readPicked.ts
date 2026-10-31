import * as FileSystem from 'expo-file-system/legacy'

/**
 * A file the document picker returned. On the web it carries the `File` the
 * browser handed over and `uri` is only an object URL; native files are read by
 * `uri`.
 */
export type PickedFile = { uri: string; file?: Blob }

/**
 * The text of a picked file; with `length`, only its first `length` characters'
 * worth of bytes, so an oversized file can be refused without reading it all.
 */
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
