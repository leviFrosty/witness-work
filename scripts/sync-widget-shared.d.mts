type Locales = Record<string, Record<string, unknown>>
type WearKeys = {
  strings: string[]
  widgetStrings: string[]
  wearStrings: string[]
  androidVariants: string[]
}

export function readLocales(directory: string): Locales
export function stringCatalog(locales: Locales, keys: string[]): string
export function shortcutCatalog(
  locales: Locales,
  phraseKeys: string[],
  shortcutsSwift: string
): { catalog: string; problems: string[] }
export function wearKeys(keys: WearKeys): { name: string; source: string }[]
export function wearStringResources(
  locales: Locales,
  keys: WearKeys
): Record<string, string>
export function wearBundledStrings(keys: WearKeys): string
export function kotlinL10nKeys(kotlin: string): Set<string>
export function l10nKeys(swift: string): Set<string>
export function alertTextKeys(swift: string): Set<string>
