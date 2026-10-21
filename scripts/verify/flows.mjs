// Runs e2e/maestro/*.yaml through the verification run's agent-device session.
// Maestro's own iOS driver (and agent-device's replay runner) can't see React
// Native views on iOS 27 simulators, while the interactive session can, so
// `ww-verify flow` interprets this subset of Maestro itself. Keep flows inside
// it; anything else fails loudly with the step that used it.
import { parseAllDocuments } from 'yaml'

const quote = (text) => `"${String(text).replace(/"/g, '\\"')}"`

function selector(target) {
  if (typeof target === 'string') return `label=${quote(target)}`
  const parts = []
  // Maestro's `traits: button` maps onto the accessibility role.
  const role =
    target.role ?? (target.traits === 'button' ? 'button' : undefined)
  if (role) parts.push(`role=${quote(role)}`)
  if (target.text) parts.push(`label=${quote(target.text)}`)
  if (target.id) parts.push(`id=${quote(target.id)}`)
  // `editable: true` (an extension) picks a text field over its row's label,
  // since a row's field is announced by the row's label too.
  if (target.editable) parts.push('editable=true')
  if (!parts.length)
    throw new Error(`Unsupported selector ${JSON.stringify(target)}`)
  return parts.join(' ')
}

function text(target) {
  return typeof target === 'string' ? target : target.text
}

/**
 * Waits for text; `text: [A, B]` waits for whichever shows, each in turn (the
 * system share sheet reads differently on iOS and Android).
 */
function waitText(label, timeout) {
  if (!Array.isArray(label)) return ['wait', 'text', label, String(timeout)]
  const each = String(Math.ceil(timeout / label.length))
  return { any: label.map((one) => ['wait', 'text', one, each]) }
}

/** Translates one Maestro step into agent-device session commands. */
function commandsFor(step) {
  const [name, value] =
    typeof step === 'string' ? [step, undefined] : Object.entries(step)[0]
  switch (name) {
    case 'tapOn':
      // `index: 0` taps the first of several matches for the text, e.g. one of
      // two wheels' rows with the same number. Which match is first is
      // agent-device's choice, not the screen's order.
      if (value?.index !== undefined) {
        if (value.index !== 0)
          throw new Error('tapOn supports only index: 0 (the first match)')
        return [['find', text(value), 'click', '--first']]
      }
      // `text: [a, b]` (an extension) tries each label in order, for controls
      // whose accessible name differs by platform.
      if (Array.isArray(value?.text)) {
        return [
          {
            any: value.text.map((label) => [
              'press',
              selector({ ...value, text: label }),
              '--settle',
            ]),
          },
        ]
      }
      return [['press', selector(value), '--settle']]
    case 'longPressOn':
      // Opens a row's context menu (iOS) or dropdown (Android).
      return [['longpress', selector(value), '--settle']]
    case 'assertVisible':
      return [waitText(text(value), 10000)]
    case 'assertNotVisible':
      return [['wait', 'absent', selector(value), '10000']]
    case 'extendedWaitUntil':
      if (value.visible)
        return [waitText(text(value.visible), value.timeout ?? 30000)]
      return [
        [
          'wait',
          'absent',
          selector(value.notVisible),
          String(value.timeout ?? 30000),
        ],
      ]
    case 'inputText':
      return [['type', String(value)]]
    case 'eraseText':
      // Clears the field the last tapOn focused, whatever the count:
      // agent-device replaces its text rather than sending backspaces, and its
      // iOS snapshots don't say which field has focus.
      return [{ eraseLastTapped: true }]
    case 'hideKeyboard':
      // iOS often exposes no dismiss key; agent-device then refuses rather than tapping blindly.
      return [['keyboard', 'dismiss', { optional: true }]]
    case 'back':
      return [['back', '--settle']]
    case 'scroll':
      return [['scroll', 'down', '--settle']]
    case 'scrollUntilVisible':
      // agent-device stops scrolling once the element is on screen, so a
      // target near the top isn't scrolled past.
      return [
        [
          'scroll',
          value.direction?.toLowerCase() ?? 'down',
          '--until',
          selector(value.element),
        ],
        ['wait', 'text', text(value.element), '5000'],
      ]
    case 'evalScript':
      // Runs in the app (Maestro runs it in its own engine), for what a deep
      // link would do mid-flow, such as opening a day computed from today.
      if (typeof value !== 'string')
        throw new Error('evalScript takes a string; use a ">-" block scalar')
      return [{ evalApp: value }]
    case 'runFlow':
      // Inline commands that run only while `when.visible` text shows (within
      // `when.timeout`, default 3 s), e.g. a one-time sheet.
      if (!value?.when?.visible || !Array.isArray(value.commands))
        throw new Error(
          'runFlow supports `when: { visible }` and inline `commands`'
        )
      return [{ runFlow: value }]
    case 'waitForAnimationToEnd':
      return [['wait', 'stable', '500', '10000']]
    default:
      throw new Error(
        `Flow step "${name}" is outside the supported Maestro subset (scripts/verify/flows.mjs)`
      )
  }
}

export function readFlow(source) {
  const docs = parseAllDocuments(source).map((doc) => doc.toJS())
  const steps = docs.at(-1)
  if (!Array.isArray(steps))
    throw new Error('A flow needs a "---" separated list of steps')
  return { config: docs.length > 1 ? docs[0] : {}, steps }
}

/**
 * Returns { ok, step, command, output } for the first failing step, or { ok:
 * true }. `evalApp` evaluates JS in the app and resolves to its value.
 */
export async function runSteps(steps, agentDevice, evalApp) {
  // A LogBox banner from before the harness muted it would cover the tab bar,
  // and a seed can re-layout the screen, so clear both before the first step.
  agentDevice(['react-native', 'dismiss-overlay'])
  agentDevice(['snapshot', '-i'])
  return runList(steps, agentDevice, evalApp)
}

async function runList(steps, agentDevice, evalApp) {
  // The selector of the last tapOn, for eraseText.
  let lastTapped
  for (const [index, step] of steps.entries()) {
    let commands
    try {
      commands = commandsFor(step)
    } catch (error) {
      return {
        ok: false,
        step: index + 1,
        command: JSON.stringify(step),
        output: error.message,
      }
    }
    for (const entry of commands) {
      if (entry.runFlow) {
        const { when, commands: nested } = entry.runFlow
        const shown =
          agentDevice([
            'wait',
            'text',
            when.visible,
            String(when.timeout ?? 3000),
          ]).status === 0
        if (!shown) continue
        const result = await runList(nested, agentDevice, evalApp)
        if (result.ok) continue
        return { ...result, step: `${index + 1}.${result.step}` }
      }
      if (entry.evalApp) {
        const value = await evalApp(entry.evalApp).catch(
          (error) => error.message
        )
        if (value === true) continue
        return {
          ok: false,
          step: index + 1,
          command: entry.evalApp,
          output: `evalScript must return true, got ${JSON.stringify(value)}`,
        }
      }
      if (entry.eraseLastTapped) {
        const result = lastTapped
          ? agentDevice(['fill', lastTapped, ''])
          : { status: 1, stdout: '', stderr: 'eraseText needs a tapOn first' }
        if (result.status === 0) continue
        return {
          ok: false,
          step: index + 1,
          command: `agent-device fill ${lastTapped} ""`,
          output: `${result.stdout}${result.stderr}`.trim(),
        }
      }
      if (entry[0] === 'press') lastTapped = entry[1]
      if (entry.any) {
        const results = entry.any.map((command) => ({ command }))
        const hit = results.find(
          (attempt) =>
            (attempt.result = agentDevice(attempt.command)).status === 0
        )
        if (hit) continue
        return {
          ok: false,
          step: index + 1,
          command: entry.any
            .map((command) => `agent-device ${command.join(' ')}`)
            .join(' | '),
          output: 'no alternative matched',
        }
      }
      const optional = typeof entry.at(-1) === 'object'
      const command = optional ? entry.slice(0, -1) : entry
      const result = agentDevice(command)
      if (result.status !== 0 && !optional) {
        return {
          ok: false,
          step: index + 1,
          command: `agent-device ${command.join(' ')}`,
          output: `${result.stdout}${result.stderr}`
            .trim()
            .split('\n')
            .slice(-8)
            .join('\n'),
        }
      }
    }
  }
  return { ok: true }
}
