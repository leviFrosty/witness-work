// Runs e2e/maestro/*.yaml through the verification run's agent-device session.
// Maestro's own iOS driver (and agent-device's replay runner) can't see React
// Native views on iOS 27 simulators, while the interactive session can, so
// `ww-verify flow` interprets this subset of Maestro itself. Keep flows inside
// it; anything else fails loudly with the step that used it.
import { parseAllDocuments } from 'yaml'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
 * system share sheet reads differently on iOS and Android). Text matches
 * anywhere in an element's label, so a sentence that quotes it counts too. With
 * `id`, `role`, `traits` or `editable`, it waits for that element instead (the
 * note editor's text box, once its web view has loaded).
 */
function waitFor(target, timeout) {
  if (
    typeof target === 'object' &&
    ['id', 'role', 'traits', 'editable'].some((key) => key in target)
  )
    return ['wait', selector(target), String(timeout)]
  const label = text(target)
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
      return [waitFor(value, 10000)]
    case 'assertNotVisible':
      return [['wait', 'absent', selector(value), '10000']]
    case 'extendedWaitUntil':
      // `true: <js>` (an extension, after Maestro's assertTrue) polls the app
      // until the expression is true, for readiness no screen shows.
      if (value.true !== undefined)
        return [
          { waitApp: String(value.true), timeout: value.timeout ?? 30000 },
        ]
      if (value.visible) return [waitFor(value.visible, value.timeout ?? 30000)]
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
      // Inline commands that run only on `when.platform` (iOS or Android)
      // and/or while `when.visible` text shows (within `when.timeout`, default
      // 3 s), e.g. a one-time sheet.
      if (
        !(value?.when?.visible || value?.when?.platform) ||
        !Array.isArray(value.commands)
      )
        throw new Error(
          'runFlow supports `when: { visible, platform }` and inline `commands`'
        )
      return [{ runFlow: value }]
    case 'waitForAnimationToEnd':
      // As in Maestro, a screen that never settles (a live map) only ends
      // the wait; it doesn't fail the flow.
      return [['wait', 'stable', '500', '10000', { optional: true }]]
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
 * true }. `evalApp` evaluates JS in the app and resolves to its value;
 * `platform` ('ios' or 'android') picks `runFlow` blocks for one platform.
 */
export async function runSteps(steps, agentDevice, evalApp, platform) {
  return runList(steps, agentDevice, evalApp, platform)
}

async function runList(steps, agentDevice, evalApp, platform) {
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
        if (
          when.platform &&
          String(when.platform).toLowerCase() !== platform?.toLowerCase()
        )
          continue
        const shown =
          !when.visible ||
          agentDevice([
            'wait',
            'text',
            when.visible,
            String(when.timeout ?? 3000),
          ]).status === 0
        if (!shown) continue
        const result = await runList(nested, agentDevice, evalApp, platform)
        if (result.ok) continue
        return { ...result, step: `${index + 1}.${result.step}` }
      }
      if (entry.waitApp) {
        const deadline = Date.now() + entry.timeout
        let value
        while (Date.now() < deadline) {
          value = await evalApp(entry.waitApp).catch((error) => error.message)
          if (value === true) break
          await pause(250)
        }
        if (value === true) continue
        return {
          ok: false,
          step: index + 1,
          command: entry.waitApp,
          output: `not true within ${entry.timeout} ms (last ${JSON.stringify(value)})`,
        }
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

/** True when a snapshot lists controls to act on, not an empty or blank tree. */
export const readsControls = (output) =>
  (output.match(/@[ae]\d+/g) ?? []).length >= 3

/**
 * Puts the app in the state a flow starts from, whatever the last flow (or a
 * person driving by hand) left behind, so one failed flow can't fail every flow
 * after it:
 *
 * 1. Answers any alert still up, such as "Discard Changes?" from a form a failed
 *    flow left mid-edit. It's native, so no remount closes it.
 * 2. Seeds `seed`, then remounts every screen on the root (Home, or onboarding for
 *    `fresh`), dropping open sheets, modals and the keyboard.
 * 3. Runs the flow's `setup` expressions, once the new screens are up.
 * 4. Waits until the screen reads with controls on it: a snapshot taken right
 *    after a seed can come back empty, and the first tap then misses. A share
 *    sheet still up on iOS is tapped away here. With `strictReader`, a snapshot
 *    from agent-device's slow fallback reader fails the start, so the caller
 *    can relaunch.
 *
 * Resolves to null, or to a failure ({ step: 'start', command, output }).
 *
 * @param {{ seed?: string; setup?: string[] }} flow
 * @param {{
 *   agentDevice: (args: string[]) => {
 *     status: number | null
 *     stdout: string
 *     stderr: string
 *   }
 *   evalApp: (expression: string) => Promise<any>
 *   wait?: (ms: number) => Promise<void>
 *   timeoutMs?: number
 *   strictReader?: boolean
 * }} io
 */
export async function startFlow(
  { seed, setup = [] },
  {
    agentDevice,
    evalApp,
    wait = pause,
    timeoutMs = 30_000,
    strictReader = false,
  }
) {
  const failure = (command, output) => ({
    ok: false,
    step: 'start',
    command,
    output,
  })
  // The app lists its alerts (agent-device's own alert query can time out
  // over a busy iOS screen). Any button will do, since the seed replaces what
  // it acts on; the cancel one is the gentlest.
  const alerts = await evalApp('__WW_DEV__.alerts()').catch(() => [])
  // A press that misses means the alert already went (a lone OK reports
  // nothing back when pressed), so it doesn't fail the flow.
  for (const alert of [...(alerts ?? [])].reverse())
    agentDevice([
      'press',
      `label=${JSON.stringify(alert.cancel ?? alert.buttons[0])}`,
    ])
  await evalApp('__WW_DEV__.forgetAlerts()').catch(() => {})
  try {
    if (seed) await evalApp(`__WW_DEV__.seed(${JSON.stringify(seed)})`)
    await evalApp('__WW_DEV__.remount()')
  } catch (error) {
    return failure(`seed ${seed ?? ''} + remount`, error.message)
  }
  const deadline = Date.now() + timeoutMs
  let state
  while (Date.now() < deadline) {
    state = await evalApp('__WW_DEV__.state()').catch((error) => ({
      error: error.message,
    }))
    if (state?.ready) break
    await wait(250)
  }
  if (!state?.ready)
    return failure(
      '__WW_DEV__.state().ready',
      `Navigation never came back after the remount: ${JSON.stringify(state)}`
    )
  for (const expression of setup) {
    try {
      await evalApp(expression)
    } catch (error) {
      return failure(expression, error.message)
    }
  }
  // A LogBox banner from before the harness muted it would cover the tab bar.
  agentDevice(['react-native', 'dismiss-overlay'])
  let snapshot = ''
  while (Date.now() < deadline) {
    const result = agentDevice(['snapshot', '-i'])
    snapshot = `${result.stdout}${result.stderr}`
    // iOS keeps a share sheet a failed flow left open over the remount; tap
    // its backdrop away.
    if (/"dismiss popup"/.test(snapshot)) {
      agentDevice(['press', 'label="dismiss popup"'])
      continue
    }
    // agent-device turned its fast iOS reader off for this app process, which
    // makes later reads slow and partial; a relaunch turns it back on.
    if (strictReader && /circuit-disabled/.test(snapshot))
      return failure(
        'agent-device snapshot -i',
        "agent-device's iOS reader is off for this app process (circuit-disabled)"
      )
    if (result.status === 0 && readsControls(snapshot)) return null
    await wait(500)
  }
  return failure(
    'agent-device snapshot -i',
    `The first screen never read with controls on it:\n${snapshot.trim().split('\n').slice(-8).join('\n')}`
  )
}
