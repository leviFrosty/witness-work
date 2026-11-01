import { parseAllDocuments } from 'yaml'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const quote = (text) => `"${String(text).replace(/"/g, '\\"')}"`

function selector(target) {
  if (typeof target === 'string') return `label=${quote(target)}`
  const parts = []

  const role =
    target.role ?? (target.traits === 'button' ? 'button' : undefined)
  if (role) parts.push(`role=${quote(role)}`)
  if (target.text) parts.push(`label=${quote(target.text)}`)
  if (target.id) parts.push(`id=${quote(target.id)}`)

  if (target.editable) parts.push('editable=true')
  if (!parts.length)
    throw new Error(`Unsupported selector ${JSON.stringify(target)}`)
  return parts.join(' ')
}

function text(target) {
  return typeof target === 'string' ? target : target.text
}

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

function commandsFor(step) {
  const [name, value] =
    typeof step === 'string' ? [step, undefined] : Object.entries(step)[0]
  switch (name) {
    case 'tapOn':
      if (value?.index !== undefined) {
        if (value.index !== 0)
          throw new Error('tapOn supports only index: 0 (the first match)')
        return [['find', text(value), 'click', '--first']]
      }

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
      return [['longpress', selector(value), '--settle']]
    case 'assertVisible':
      return [waitFor(value, 10000)]
    case 'assertNotVisible':
      return [['wait', 'absent', selector(value), '10000']]
    case 'extendedWaitUntil':
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
      return [{ eraseLastTapped: true }]
    case 'hideKeyboard':
      return [['keyboard', 'dismiss', { optional: true }]]
    case 'back':
      return [['back', '--settle']]
    case 'scroll':
      return [['scroll', 'down', '--settle']]
    case 'scrollUntilVisible':
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
      if (typeof value !== 'string')
        throw new Error('evalScript takes a string; use a ">-" block scalar')
      return [{ evalApp: value }]
    case 'runFlow':
      if (
        !(value?.when?.visible || value?.when?.platform) ||
        !Array.isArray(value.commands)
      )
        throw new Error(
          'runFlow supports `when: { visible, platform }` and inline `commands`'
        )
      return [{ runFlow: value }]
    case 'waitForAnimationToEnd':
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

export async function runSteps(steps, agentDevice, evalApp, platform) {
  return runList(steps, agentDevice, evalApp, platform)
}

async function runList(steps, agentDevice, evalApp, platform) {
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

export const readsControls = (output) =>
  (output.match(/@[ae]\d+/g) ?? []).length >= 3

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

  const alerts = await evalApp('__WW_DEV__.alerts()').catch(() => [])

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

  agentDevice(['react-native', 'dismiss-overlay'])
  let snapshot = ''
  while (Date.now() < deadline) {
    const result = agentDevice(['snapshot', '-i'])
    snapshot = `${result.stdout}${result.stderr}`

    if (/"dismiss popup"/.test(snapshot)) {
      agentDevice(['press', 'label="dismiss popup"'])
      continue
    }

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
