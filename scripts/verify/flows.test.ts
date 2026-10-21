import { describe, expect, it } from 'vitest'
import { readFlow, runSteps } from './flows.mjs'

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
})
