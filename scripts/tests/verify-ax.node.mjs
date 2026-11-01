import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  best,
  center,
  diffSnapshots,
  flatten,
  formatSnapshot,
  matchesSelector,
  matchesText,
  parseSelector,
  snapshotJson,
} from '../verify/ax.mjs'

const node = (type, label, frame, extra = {}) => ({
  type,
  AXLabel: label,
  AXValue: null,
  AXUniqueId: null,
  enabled: true,
  frame: { x: frame[0], y: frame[1], width: frame[2], height: frame[3] },
  children: [],
  ...extra,
})

const app = (...children) => [
  node('Application', 'WitnessWork Dev', [0, 0, 1032, 1376], { children }),
]

test('keeps labeled and interactive elements, drops the app and scroll bars', () => {
  const elements = flatten(
    app(
      node('Group', null, [0, 0, 1032, 1376], {
        children: [
          node('Button', 'Home', [24, 124, 192, 50]),
          node('Button', null, [300, 300, 40, 40]),
          node('Group', null, [0, 0, 10, 10]),
          node(
            'GenericElement',
            'Vertical scroll bar, 1 page',
            [1020, 0, 6, 900]
          ),
          node('StaticText', 'Hello', [250, 100, 200, 20]),
        ],
      })
    )
  )
  assert.deepEqual(
    elements.map((e) => [e.ref, e.type, e.label]),
    [
      ['a1', 'button', 'Home'],
      ['a2', 'button', null],
      ['a3', 'text', 'Hello'],
    ]
  )
})

test('drops elements whose center is off screen', () => {
  const elements = flatten(
    app(
      node('Button', 'Visible', [10, 10, 40, 40]),
      node('Button', 'Below', [10, 2000, 40, 40]),
      node('Button', 'Empty', [10, 10, 0, 0])
    )
  )
  assert.deepEqual(
    elements.map((e) => e.label),
    ['Visible']
  )
})

test('keeps one of a container and its text with the same label', () => {
  const elements = flatten(
    app(
      node('GenericElement', 'Add Time', [600, 290, 450, 60], {
        children: [node('StaticText', 'Add Time', [780, 310, 90, 20])],
      })
    )
  )
  assert.equal(elements.length, 1)
  assert.equal(elements[0].type, 'other')

  const both = flatten(
    app(
      node('Button', 'T', [100, 100, 20, 20]),
      node('Button', 'T', [300, 100, 20, 20])
    )
  )
  assert.equal(both.length, 2)
})

test('parses the agent-device selectors flows use', () => {
  assert.deepEqual(parseSelector('label="Add Time"'), { label: 'Add Time' })
  assert.deepEqual(parseSelector('role="button" label="Close"'), {
    role: 'button',
    label: 'Close',
  })
  assert.deepEqual(parseSelector('id="time-entry-save"'), {
    id: 'time-entry-save',
  })
  assert.deepEqual(parseSelector('label="Say \\"hi\\""'), { label: 'Say "hi"' })
  assert.deepEqual(parseSelector('label="Email" editable=true'), {
    label: 'Email',
    editable: 'true',
  })

  assert.equal(parseSelector('Contacts'), null)
  assert.equal(parseSelector('xpath="//a"'), null)
})

test('matches selectors and text like agent-device', () => {
  const [button, field] = flatten(
    app(
      node('Button', 'Close', [10, 10, 40, 40], { AXUniqueId: 'close' }),
      node('TextField', null, [10, 100, 300, 40], {
        AXValue: 'Search 8 contacts',
      })
    )
  )
  assert.ok(matchesSelector(button, { label: 'Close', role: 'button' }))
  assert.ok(matchesSelector(button, { id: 'close' }))
  assert.ok(!matchesSelector(button, { label: 'Close', role: 'text' }))
  assert.ok(matchesSelector(field, { editable: 'true' }))
  assert.ok(!matchesSelector(button, { editable: 'true' }))
  assert.ok(matchesText(field, 'search 8'))
  assert.ok(!matchesText(button, 'Open'))

  const [toggle] = flatten(
    app(node('Switch', 'Notify Me', [10, 10, 60, 30], { AXValue: 0 }))
  )
  assert.ok(matchesText(toggle, 'Notify'))
  assert.ok(!matchesText(toggle, '2'))
})

test('prefers a control over text, then the smaller one', () => {
  const elements = flatten(
    app(
      node('StaticText', 'Save', [10, 10, 40, 20]),
      node('Button', 'Save', [500, 500, 100, 40]),
      node('Button', 'Save', [700, 500, 60, 40])
    )
  )
  const chosen = best(elements.filter((e) => e.label === 'Save'))
  assert.deepEqual(center(chosen), { x: 730, y: 520 })
})

test('diffs two snapshots by content, not by ref number', () => {
  const before = flatten(
    app(
      node('Button', 'Home', [0, 0, 50, 50]),
      node('Button', 'Contacts', [0, 60, 50, 50])
    )
  )
  const after = flatten(
    app(
      node('Button', 'Contacts', [0, 60, 50, 50]),
      node('Button', 'Ada Reyes', [100, 60, 50, 50])
    )
  )
  assert.deepEqual(diffSnapshots(before, after), [
    '+ @a2 [button] "Ada Reyes"',
    '- [button] "Home"',
  ])
  assert.deepEqual(diffSnapshots(before, before), [])
  const many = flatten(
    app(
      ...Array.from({ length: 50 }, (_, i) =>
        node('Button', `Row ${i}`, [0, i * 20, 50, 20])
      )
    )
  )
  const capped = diffSnapshots([], many, 5)
  assert.equal(capped.length, 6)
  assert.match(capped.at(-1), /45 more/)
})

test('prints a compact snapshot and agent-device-shaped JSON', () => {
  const elements = flatten(
    app(
      node('Button', 'Date', [10, 10, 40, 40], {
        AXValue: 'Today',
        AXUniqueId: 'time-entry-date-pill',
      }),
      node('GenericElement', 'Submit', [10, 60, 40, 40], { enabled: false })
    )
  )
  assert.equal(
    formatSnapshot(elements),
    [
      'Snapshot (AXe): 2 elements',
      '@a1 [button] "Date" value="Today" id="time-entry-date-pill"',
      '@a2 [other] "Submit" [disabled]',
    ].join('\n')
  )
  const json = JSON.parse(snapshotJson(elements))
  assert.equal(json.data.nodes[0].ref, 'a1')
  assert.equal(json.data.nodes[1].enabled, false)
})
