import { describe, expect, it } from 'vitest'
import { readFlow, runSteps, startFlow } from './flows.mjs'

type Result = { status: number; stdout: string; stderr: string }

/** Records agent-device calls; `fail` lists commands (joined) that fail. */
const fakeDevice = (fail: string[] = []) => {
  const calls: string[] = []
  const agentDevice = (args: string[]): Result => {
    const command = args.join(' ')
    calls.push(command)
    return fail.includes(command)
      ? { status: 1, stdout: '', stderr: 'no match' }
      : { status: 0, stdout: '', stderr: '' }
  }
  return { calls, agentDevice }
}

const steps = (yaml: string) => readFlow(`appId: x\n---\n${yaml}`).steps

const noEval = async () => true

describe('runSteps', () => {
  it('clears the field the last tapOn focused', async () => {
    const { calls, agentDevice } = fakeDevice()
    const result = await runSteps(
      steps('- tapOn:\n    id: contacts-search\n- inputText: Ada\n- eraseText'),
      agentDevice,
      noEval
    )
    expect(result).toEqual({ ok: true })
    expect(calls.at(-1)).toBe('fill id="contacts-search" ')
  })

  it('fails eraseText without an earlier tapOn', async () => {
    const { agentDevice } = fakeDevice()
    const result = await runSteps(steps('- eraseText'), agentDevice, noEval)
    expect(result).toMatchObject({ ok: false, step: 1 })
  })

  it('picks a text field with editable: true', async () => {
    const { calls, agentDevice } = fakeDevice()
    await runSteps(
      steps('- tapOn:\n    text: Name\n    editable: true'),
      agentDevice,
      noEval
    )
    expect(calls).toContain('press label="Name" editable=true --settle')
  })

  it('long-presses a target', async () => {
    const { calls, agentDevice } = fakeDevice()
    await runSteps(
      steps('- longPressOn:\n    id: rollover-row'),
      agentDevice,
      noEval
    )
    expect(calls).toContain('longpress id="rollover-row" --settle')
  })

  it('scrolls until the element is on screen', async () => {
    const { calls, agentDevice } = fakeDevice()
    await runSteps(
      steps('- scrollUntilVisible:\n    element: Talked'),
      agentDevice,
      noEval
    )
    expect(calls).toContain('scroll down --until label="Talked"')
  })

  it('runs a conditional runFlow only while its text shows', async () => {
    const shown = fakeDevice()
    const flow = steps(
      '- runFlow:\n    when:\n      visible: How should we start?\n    commands:\n      - tapOn: Keep'
    )
    await runSteps(flow, shown.agentDevice, noEval)
    expect(shown.calls).toContain('press label="Keep" --settle')

    const hidden = fakeDevice(['wait text How should we start? 3000'])
    expect(await runSteps(flow, hidden.agentDevice, noEval)).toEqual({
      ok: true,
    })
    expect(hidden.calls).not.toContain('press label="Keep" --settle')
  })

  it('numbers a failing step inside runFlow under its parent', async () => {
    const { agentDevice } = fakeDevice(['press label="Keep" --settle'])
    const result = await runSteps(
      steps(
        '- tapOn: Sync\n- runFlow:\n    when:\n      visible: Ask\n    commands:\n      - tapOn: Keep'
      ),
      agentDevice,
      noEval
    )
    expect(result).toMatchObject({ ok: false, step: '2.1' })
  })

  it('fails an evalScript that does not return true', async () => {
    const { agentDevice } = fakeDevice()
    const result = await runSteps(
      steps('- evalScript: >-\n    navigate({ a: 1 })'),
      agentDevice,
      async (expression: string) => expression === 'navigate({ a: 1 })' && 0
    )
    expect(result).toMatchObject({ ok: false, step: 1 })
  })

  it('rejects an evalScript YAML parsed as a map', async () => {
    const { agentDevice } = fakeDevice()
    const result = await runSteps(
      steps('- evalScript: navigate({ a: 1 })'),
      agentDevice,
      noEval
    )
    expect(result).toMatchObject({ ok: false, step: 1 })
  })

  it('runs a runFlow only on its platform', async () => {
    const flow = steps(
      '- runFlow:\n    when:\n      platform: Android\n    commands:\n      - back'
    )
    const ios = fakeDevice()
    await runSteps(flow, ios.agentDevice, noEval, 'ios')
    expect(ios.calls).not.toContain('back --settle')
    const android = fakeDevice()
    await runSteps(flow, android.agentDevice, noEval, 'android')
    expect(android.calls).toContain('back --settle')
  })

  it('waits for an element when the target has more than text', async () => {
    const { calls, agentDevice } = fakeDevice()
    await runSteps(
      steps(
        '- assertVisible:\n    id: time-entry-save\n- assertVisible:\n    text: Report -'
      ),
      agentDevice,
      noEval
    )
    expect(calls).toEqual([
      'wait id="time-entry-save" 10000',
      'wait text Report - 10000',
    ])
  })

  it('goes on when waitForAnimationToEnd never settles', async () => {
    const { calls, agentDevice } = fakeDevice(['wait stable 500 10000'])
    const result = await runSteps(
      steps('- waitForAnimationToEnd\n- tapOn: Done'),
      agentDevice,
      noEval
    )
    expect(result).toEqual({ ok: true })
    expect(calls).toContain('press label="Done" --settle')
  })

  it('polls the app until an extendedWaitUntil expression is true', async () => {
    const { agentDevice } = fakeDevice()
    let polls = 0
    const result = await runSteps(
      steps('- extendedWaitUntil:\n    true: ready()\n    timeout: 5000'),
      agentDevice,
      async () => ++polls === 3
    )
    expect(result).toEqual({ ok: true })
    expect(polls).toBe(3)
  })
})

describe('startFlow', () => {
  const app = (alerts: unknown[] = [], readyAfter = 1) => {
    const evals: string[] = []
    let stateReads = 0
    const evalApp = async (expression: string) => {
      evals.push(expression)
      if (expression === '__WW_DEV__.alerts()') return alerts
      if (expression === '__WW_DEV__.state()')
        return { ready: ++stateReads >= readyAfter }
      return true
    }
    return { evals, evalApp }
  }
  const controls =
    '@e1 [button] "Home"\n@e2 [button] "Contacts"\n@e3 [button] "Add"'
  const device = (snapshots: string[]) => {
    const calls: string[] = []
    const agentDevice = (args: string[]): Result => {
      calls.push(args.join(' '))
      if (args[0] !== 'snapshot') return { status: 0, stdout: '', stderr: '' }
      return { status: 0, stdout: snapshots.shift() ?? controls, stderr: '' }
    }
    return { calls, agentDevice }
  }
  const wait = async () => {}

  it('answers a leftover alert before seeding, then remounts', async () => {
    const { evals, evalApp } = app([
      {
        title: 'Discard Changes?',
        buttons: ['Keep Editing', 'Discard'],
        cancel: 'Keep Editing',
      },
    ])
    const { calls, agentDevice } = device([])
    const result = await startFlow(
      { seed: 'pioneer', setup: ['tweak()'] },
      { agentDevice, evalApp, wait }
    )
    expect(result).toBeNull()
    expect(calls[0]).toBe('press label="Keep Editing"')
    expect(evals).toEqual([
      '__WW_DEV__.alerts()',
      '__WW_DEV__.forgetAlerts()',
      '__WW_DEV__.seed("pioneer")',
      '__WW_DEV__.remount()',
      '__WW_DEV__.state()',
      'tweak()',
    ])
  })

  it('waits for the remounted screens and a snapshot with controls', async () => {
    const { evals, evalApp } = app([], 3)
    const { calls, agentDevice } = device([
      '',
      '@e1 [application] "WitnessWork"',
    ])
    expect(await startFlow({}, { agentDevice, evalApp, wait })).toBeNull()
    expect(evals.filter((e) => e === '__WW_DEV__.state()')).toHaveLength(3)
    expect(calls.filter((c) => c === 'snapshot -i')).toHaveLength(3)
  })

  it('taps away a share sheet left open', async () => {
    const { evalApp } = app()
    const { calls, agentDevice } = device(['@e1 [other] "dismiss popup"'])
    expect(await startFlow({}, { agentDevice, evalApp, wait })).toBeNull()
    expect(calls).toContain('press label="dismiss popup"')
  })

  it('fails the start on a disabled iOS reader only when strict', async () => {
    const slow = `${controls}\nSimulator AX snapshot unavailable (circuit-disabled)`
    const strict = device([slow])
    expect(
      await startFlow(
        {},
        {
          agentDevice: strict.agentDevice,
          evalApp: app().evalApp,
          wait,
          strictReader: true,
        }
      )
    ).toMatchObject({ ok: false, step: 'start' })
    const lenient = device([slow])
    expect(
      await startFlow(
        {},
        { agentDevice: lenient.agentDevice, evalApp: app().evalApp, wait }
      )
    ).toBeNull()
  })

  it('fails the start when navigation never comes back', async () => {
    const { evalApp } = app([], Infinity)
    const { agentDevice } = device([])
    const result = await startFlow(
      {},
      { agentDevice, evalApp, wait, timeoutMs: 0 }
    )
    expect(result).toMatchObject({ ok: false, step: 'start' })
  })
})
