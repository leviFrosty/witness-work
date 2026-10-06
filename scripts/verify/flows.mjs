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
  if (!parts.length)
    throw new Error(`Unsupported selector ${JSON.stringify(target)}`)
  return parts.join(' ')
}

function text(target) {
  return typeof target === 'string' ? target : target.text
}

/** Translates one Maestro step into agent-device session commands. */
function commandsFor(step) {
  const [name, value] =
    typeof step === 'string' ? [step, undefined] : Object.entries(step)[0]
  switch (name) {
    case 'tapOn':
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
    case 'assertVisible':
      return [['wait', 'text', text(value), '10000']]
    case 'assertNotVisible':
      return [['wait', 'absent', selector(value), '10000']]
    case 'extendedWaitUntil':
      if (value.visible)
        return [
          ['wait', 'text', text(value.visible), String(value.timeout ?? 30000)],
        ]
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
      return [['press', 'Backspace']]
    case 'hideKeyboard':
      // iOS often exposes no dismiss key; agent-device then refuses rather than tapping blindly.
      return [['keyboard', 'dismiss', { optional: true }]]
    case 'back':
      return [['back', '--settle']]
    case 'scroll':
      return [['scroll', 'down', '--settle']]
    case 'scrollUntilVisible':
      return Array.from({ length: 6 }, () => [
        'scroll',
        value.direction?.toLowerCase() ?? 'down',
        '--settle',
      ]).concat([['wait', 'text', text(value.element), '5000']])
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
 * true }.
 */
export function runSteps(steps, agentDevice) {
  // A LogBox banner from before the harness muted it would cover the tab bar,
  // and a seed can re-layout the screen, so clear both before the first step.
  agentDevice(['react-native', 'dismiss-overlay'])
  agentDevice(['snapshot', '-i'])
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
