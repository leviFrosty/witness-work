import { Platform } from 'react-native'
import { Asset } from 'expo-asset'
import * as Font from 'expo-font'
import * as FileSystem from 'expo-file-system/legacy'

const stableFontsDirectory = () => `${FileSystem.documentDirectory ?? ''}fonts/`

const copies = new Map<string, Promise<string>>()

async function stableCopy(module: number): Promise<string> {
  const asset = Asset.fromModule(module)
  await asset.downloadAsync()
  const source = asset.localUri
  if (!source || !asset.hash) throw new Error('Font asset has no local file')
  const directory = stableFontsDirectory()
  const target = `${directory}${asset.hash}.${asset.type || 'ttf'}`
  if ((await FileSystem.getInfoAsync(target)).exists) return target
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  const partial = `${target}.${Date.now()}.part`
  await FileSystem.copyAsync({ from: source, to: partial })
  await FileSystem.moveAsync({ from: partial, to: target })
  return target
}

const usesStableCopies = Platform.OS === 'ios' && !__DEV__

async function sourceFor(module: number): Promise<Font.FontSource> {
  if (!usesStableCopies) return module
  try {
    let copy = copies.get(String(module))
    if (!copy) {
      copy = stableCopy(module)
      copies.set(String(module), copy)
      copy.catch(() => copies.delete(String(module)))
    }
    return { uri: await copy }
  } catch {
    return module
  }
}

export async function loadFonts(fontModules: Record<string, number>) {
  const pending = Object.entries(fontModules).filter(
    ([family]) => !Font.isLoaded(family)
  )
  if (pending.length === 0) return
  const sources = await Promise.all(
    pending.map(
      async ([family, module]) => [family, await sourceFor(module)] as const
    )
  )
  await Font.loadAsync(Object.fromEntries(sources))
}
