type AgentDevice = (args: string[]) => {
  status: number | null
  stdout: string
  stderr: string
}
type EvalApp = (expression: string) => Promise<unknown>
type Failure = {
  ok: false
  step: number | string
  command: string
  output: string
}

export function readFlow(source: string): {
  config: Record<string, unknown>
  steps: unknown[]
}
export function runSteps(
  steps: unknown[],
  agentDevice: AgentDevice,
  evalApp: EvalApp,
  platform?: string
): Promise<{ ok: true } | Failure>
export function startFlow(
  flow: { seed?: string; setup?: string[] },
  io: {
    agentDevice: AgentDevice
    evalApp: EvalApp
    wait?: (ms: number) => Promise<void>
    timeoutMs?: number
    strictReader?: boolean
  }
): Promise<Failure | null>
export function readsControls(output: string): boolean
