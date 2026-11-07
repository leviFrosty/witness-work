const normalize = (text: string) =>
  text.normalize('NFC').replace(/\s+/g, ' ').trim()

const HAS_LETTER = /\p{L}/u

const PERSON_LIKE_KEY =
  /(preview|sample|example|demo)\w*name|contactName|buddyName|^color[A-Z]/i

const EDITABLE = '[contenteditable], .ProseMirror, [data-ph-mask]'

export const maskStars = (text: string): string => text.replace(/\S/g, '*')

export const collectInterfaceStrings = (
  ...tables: readonly unknown[]
): Set<string> => {
  const strings = new Set<string>()
  const visit = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      if (value.includes('{{') || !HAS_LETTER.test(value)) return
      if (PERSON_LIKE_KEY.test(key)) return
      strings.add(normalize(value))
    } else if (value && typeof value === 'object') {
      for (const [name, child] of Object.entries(value)) visit(child, name)
    }
  }
  tables.forEach((table) => visit(table, ''))
  return strings
}

export const createTextMasker = (interfaceStrings: ReadonlySet<string>) => {
  return (text: string, element?: Element | null): string => {
    const visible = normalize(text)
    if (!visible) return text

    if (element?.closest?.(EDITABLE)) return maskStars(text)
    return interfaceStrings.has(visible) ? text : maskStars(text)
  }
}

export const maskInputValue = (value: string): string => maskStars(value)

const KEPT_ATTRIBUTES = new Set([
  'class',
  'style',
  'dir',
  'role',
  'type',
  'lang',
  'hidden',
  'disabled',
  'checked',
  'selected',
  'open',
  'tabindex',
  'width',
  'height',
  'viewbox',
  'preserveaspectratio',
  'xmlns',
  'd',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'transform',
  'fill',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'offset',
  'stop-color',
  'stop-opacity',
])

const RECORDER_LAYOUT =
  /^rr_(width|height|left|top|position|scrolltop|scrollleft)$/

const stripUrls = (css: string): string =>
  css.replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)/gi, 'url()')

export const maskAttribute = (name: string, value: string): string => {
  const key = name.toLowerCase()

  if (RECORDER_LAYOUT.test(key)) return value

  if (key === '_csstext' || key === 'style') return stripUrls(value)
  if (KEPT_ATTRIBUTES.has(key)) return value
  return ''
}

export const maskReplayUrl = (url: string): string => {
  try {
    const parsed = new URL(url)

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return ''
    const path = parsed.pathname
      .split('/')
      .map((segment) =>
        segment && (/[\d\-_%]/.test(segment) || segment.length > 24)
          ? ':id'
          : segment
      )
      .join('/')
    return `${parsed.origin}${path}`
  } catch {
    return ''
  }
}
