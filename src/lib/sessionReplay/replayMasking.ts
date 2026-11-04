/**
 * What a web recording hides before it leaves the browser (ADR 0043). Text is
 * masked unless it is, exactly, one of the interface strings in the active
 * language, so names, addresses, notes and any sentence built from them stay
 * masked. These are pure functions the recorder calls for each node.
 */

const normalize = (text: string) =>
  text.normalize('NFC').replace(/\s+/g, ' ').trim()

/** Letters in any script. A string without one (a number, a symbol) is data. */
const HAS_LETTER = /\p{L}/u

/**
 * Strings that are also people's names: the sample names the app shows in
 * previews (`defaultNavPreview_contactName`) and the colors it names
 * (`colorAmber`). A Contact could be called the same, so they never count.
 */
const PERSON_LIKE_KEY =
  /(preview|sample|example|demo)\w*name|contactName|buddyName|^color[A-Z]/i

/** Text the User types or edits (the rich note editor), which is never kept. */
const EDITABLE = '[contenteditable], .ProseMirror, [data-ph-mask]'

/** Replaces each character but whitespace, as the recorder's own mask does. */
export const maskStars = (text: string): string => text.replace(/\S/g, '*')

/**
 * Every interface string in `tables` (translation objects: the active
 * language's). A template with a placeholder never reads as itself on screen,
 * and a string with no letter in it could be anyone's number, so neither
 * counts.
 */
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

/** A text masker that keeps a node only when it is exactly an interface string. */
export const createTextMasker = (interfaceStrings: ReadonlySet<string>) => {
  return (text: string, element?: Element | null): string => {
    const visible = normalize(text)
    if (!visible) return text
    // Words the User types read as an interface string on the way ("No").
    if (element?.closest?.(EDITABLE)) return maskStars(text)
    return interfaceStrings.has(visible) ? text : maskStars(text)
  }
}

/** Input values are always masked; the field's length stays in the recording. */
export const maskInputValue = (value: string): string => maskStars(value)

/**
 * Attributes a recording keeps, because the page can't be drawn without them.
 * Anything else is blanked: `aria-label`, `title`, `alt`, `placeholder`,
 * `href`, `src`, `value`, `id`, every `data-*`, and any attribute not named
 * here.
 */
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

/**
 * A `url(…)` in CSS can name a photo; the recording keeps the shape, not the
 * link.
 */
const stripUrls = (css: string): string =>
  css.replace(/url\((?:[^()"']|"[^"]*"|'[^']*')*\)/gi, 'url()')

export const maskAttribute = (name: string, value: string): string => {
  const key = name.toLowerCase()
  // The recorder's own size and position metadata carries no content. Its
  // other `rr_` attributes (`rr_dataURL`) can, so they're blank.
  if (RECORDER_LAYOUT.test(key)) return value
  // The inlined stylesheet and an inline style keep their rules, not addresses.
  if (key === '_csstext' || key === 'style') return stripUrls(value)
  if (KEPT_ATTRIBUTES.has(key)) return value
  return ''
}

/**
 * The address a recording and its events carry: the page's origin and route,
 * with no query, no hash and no id. A path segment that holds a digit, a
 * hyphen, an underscore or a `%`, or is long, is an id or a name, so
 * `/contacts/9f2c…` reads `/contacts/:id`.
 */
export const maskReplayUrl = (url: string): string => {
  try {
    const parsed = new URL(url)
    // A `data:` or `blob:` address can hold the content itself.
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
