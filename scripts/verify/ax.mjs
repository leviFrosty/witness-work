// Reads the iOS simulator's accessibility tree with AXe (`axe describe-ui`)
// for the half of agent-device that needs one: snapshots, refs, selectors,
// find and wait. On iPad simulators agent-device 0.21 reads only the app node
// for the sidebar shell (its XCTest query sweep times out and its private-AX
// fallback stops at three nodes), while AXe reads the whole tree through
// CoreSimulator. ww-verify resolves targets here; on iPad it taps them with
// AXe too, at the element's window position plus the window's place on screen.
//
// Everything in this file is pure; ww-verify.mjs runs AXe and agent-device.

const PRESSABLE =
  /^(Button|Link|Cell|Switch|CheckBox|Toggle|Tab|MenuItem|RadioButton|SegmentedControl|PopUpButton|Slider|Stepper|Incrementor)$/
const EDITABLE = /^(TextField|SecureTextField|SearchField|TextView|TextArea)$/
// Scroll indicators and the app itself say nothing about the screen.
const NOISE = /^(Vertical|Horizontal) scroll bar\b/

const TYPE_NAMES = {
  StaticText: 'text',
  GenericElement: 'other',
  ScrollArea: 'scroll-area',
  TextField: 'text-field',
  SecureTextField: 'secure-text-field',
  SearchField: 'search-field',
  TextView: 'text-view',
  CheckBox: 'checkbox',
  PopUpButton: 'pop-up-button',
}

const typeName = (type) =>
  TYPE_NAMES[type] ??
  String(type ?? 'other')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()

/**
 * How sure we are a tap on this element does something: 3 control, 2 other, 1
 * text.
 */
function rank(element) {
  if (PRESSABLE.test(element.axType) || EDITABLE.test(element.axType)) return 3
  if (element.axType === 'GenericElement') return 2
  return 1
}

const contains = (outer, inner) =>
  outer.x <= inner.x &&
  outer.y <= inner.y &&
  outer.x + outer.width >= inner.x + inner.width &&
  outer.y + outer.height >= inner.y + inner.height

const area = (e) => e.width * e.height

/**
 * Flattens `axe describe-ui` JSON into the elements an agent can see and act
 * on: labeled or interactive, with a center inside the app's frame. React
 * Native repeats a label on a container and its text; of two nested elements
 * with the same label and value, the one more likely to take a tap stays.
 */
export function flatten(tree) {
  const roots = Array.isArray(tree) ? tree : [tree]
  const app = roots.find((r) => r.type === 'Application')?.frame
  const bounds = app ?? { x: 0, y: 0, width: Infinity, height: Infinity }
  const kept = []
  const walk = (node) => {
    const frame = node.frame ?? {}
    const element = {
      axType: node.type,
      type: typeName(node.type),
      label: node.AXLabel ?? null,
      value: node.AXValue ?? null,
      id: node.AXUniqueId ?? null,
      enabled: node.enabled !== false,
      editable: EDITABLE.test(node.type ?? ''),
      x: frame.x ?? 0,
      y: frame.y ?? 0,
      width: frame.width ?? 0,
      height: frame.height ?? 0,
    }
    const cx = element.x + element.width / 2
    const cy = element.y + element.height / 2
    const visible =
      element.width > 0 &&
      element.height > 0 &&
      cx >= bounds.x &&
      cy >= bounds.y &&
      cx <= bounds.x + bounds.width &&
      cy <= bounds.y + bounds.height
    const meaningful =
      node.type !== 'Application' &&
      (element.label || element.value || element.id || rank(element) === 3) &&
      !NOISE.test(element.label ?? '')
    if (visible && meaningful) {
      const twin = kept.findIndex(
        (k) =>
          k.label === element.label &&
          k.value === element.value &&
          (contains(k, element) || contains(element, k))
      )
      if (twin < 0) kept.push(element)
      else {
        const other = kept[twin]
        const better =
          rank(element) > rank(other) ||
          (rank(element) === rank(other) && area(element) < area(other))
        if (better) kept[twin] = element
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const root of roots) walk(root)
  return kept.map((element, i) => ({ ref: `a${i + 1}`, ...element }))
}

export const center = (e) => ({
  x: Math.round(e.x + e.width / 2),
  y: Math.round(e.y + e.height / 2),
})

/**
 * The app window's top-left corner on screen, from an `axe describe-ui --point`
 * read that landed on SpringBoard: its app switcher lists each window as a
 * `card:<bundle id>:sceneID:…` element framed in screen coordinates. Null when
 * the read has no card for the app (the point landed in the app itself).
 */
export function windowOrigin(tree, bundleId) {
  const prefix = `card:${bundleId}:`
  const find = (node) => {
    if (String(node.AXUniqueId ?? '').startsWith(prefix) && node.frame)
      return { x: node.frame.x, y: node.frame.y }
    for (const child of node.children ?? []) {
      const found = find(child)
      if (found) return found
    }
    return null
  }
  for (const root of Array.isArray(tree) ? tree : [tree]) {
    const found = find(root)
    if (found) return found
  }
  return null
}

/**
 * A point from AXe's window coordinates in screen coordinates, where taps and
 * `--point` reads land. They differ once an iPad window is resized.
 */
export const toScreen = (point, origin) => ({
  x: Math.round(point.x + origin.x),
  y: Math.round(point.y + origin.y),
})

const quoted = (text) => JSON.stringify(String(text))

/** One element without its ref, so two snapshots can be compared. */
function describe(e) {
  const parts = [`[${e.type}]`]
  if (e.label) parts.push(quoted(e.label))
  if (e.value && e.value !== e.label) parts.push(`value=${quoted(e.value)}`)
  if (e.id) parts.push(`id=${quoted(e.id)}`)
  if (!e.enabled) parts.push('[disabled]')
  return parts.join(' ')
}

export const formatElement = (e) => `@${e.ref} ${describe(e)}`

export function formatSnapshot(elements, note) {
  return [
    `Snapshot (AXe${note ? `; ${note}` : ''}): ${elements.length} elements`,
    ...elements.map(formatElement),
  ].join('\n')
}

/** The same shape as `agent-device snapshot --json`, for the monkey. */
export function snapshotJson(elements) {
  return JSON.stringify({
    success: true,
    data: {
      backend: 'axe',
      nodes: elements.map((e) => ({
        ref: e.ref,
        label: e.label ?? undefined,
        value: e.value ?? undefined,
        identifier: e.id ?? undefined,
        type: e.type,
        enabled: e.enabled,
        editable: e.editable,
        rect: { x: e.x, y: e.y, width: e.width, height: e.height },
      })),
    },
  })
}

/**
 * Parses an agent-device selector (`label="Save" role=button editable=true`)
 * into the keys we can match, or null when it uses anything else.
 */
export function parseSelector(text) {
  const selector = {}
  const pattern = /\s*([a-z]+)=("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/gy
  let match
  let consumed = 0
  while ((match = pattern.exec(text))) {
    const [, key, raw] = match
    const value = /^["']/.test(raw)
      ? raw.startsWith('"')
        ? JSON.parse(raw)
        : raw.slice(1, -1)
      : raw
    if (!['label', 'text', 'id', 'role', 'editable', 'value'].includes(key))
      return null
    selector[key === 'text' ? 'label' : key] = value
    consumed = pattern.lastIndex
  }
  if (!Object.keys(selector).length || text.slice(consumed).trim()) return null
  return selector
}

export function matchesSelector(e, selector) {
  if (selector.label !== undefined && e.label?.trim() !== selector.label.trim())
    return false
  if (selector.value !== undefined && e.value !== selector.value) return false
  if (selector.id !== undefined && e.id !== selector.id) return false
  if (selector.editable !== undefined)
    if (e.editable !== (selector.editable === 'true')) return false
  if (selector.role !== undefined) {
    const role = selector.role.toLowerCase()
    // AXe reports a UISwitch as a CheckBox; agent-device calls it a switch.
    const roles =
      e.type === 'checkbox'
        ? [e.type, 'switch']
        : [e.type, e.axType?.toLowerCase()]
    if (!roles.includes(role)) return false
  }
  return true
}

/**
 * Case-insensitive substring match on label or value, like `find` and `wait
 * text`.
 */
export function matchesText(e, text) {
  const needle = String(text).toLowerCase()
  // AXe reports a switch's value as a number.
  return [e.label, e.value].some(
    (v) => v != null && String(v).toLowerCase().includes(needle)
  )
}

/**
 * The match most likely to be the control meant: a control over text, then the
 * smallest.
 */
export function best(elements) {
  return [...elements].sort((a, b) => rank(b) - rank(a) || area(a) - area(b))[0]
}

/** Lines added and removed between two snapshots, ignoring ref numbers. */
export function diffSnapshots(before, after, limit = 40) {
  const count = (list) => {
    const counts = new Map()
    for (const e of list)
      counts.set(describe(e), (counts.get(describe(e)) ?? 0) + 1)
    return counts
  }
  const was = count(before)
  const now = count(after)
  const lines = []
  for (const e of after) {
    const key = describe(e)
    if ((was.get(key) ?? 0) > 0) was.set(key, was.get(key) - 1)
    else lines.push(`+ ${formatElement(e)}`)
  }
  for (const e of before) {
    const key = describe(e)
    if ((now.get(key) ?? 0) > 0) now.set(key, now.get(key) - 1)
    else lines.push(`- ${key}`)
  }
  if (lines.length > limit)
    return [
      ...lines.slice(0, limit),
      `… ${lines.length - limit} more; run snapshot for the full screen`,
    ]
  return lines
}
