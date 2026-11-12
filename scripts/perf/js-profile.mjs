#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '../..')
const argv = process.argv.slice(2)
const split = argv.indexOf('--')
const options = argv.slice(0, split < 0 ? argv.length : split)
const command = split < 0 ? [] : argv.slice(split + 1)
const flag = (name, fallback) => {
  const i = options.indexOf(`--${name}`)
  return i >= 0 ? options[i + 1] : fallback
}
const out = path.resolve(ROOT, flag('out', '.verify/js-profile.cpuprofile'))
const top = Number(flag('top', 40))

const state = JSON.parse(
  fs.readFileSync(path.join(ROOT, '.verify/state.json'), 'utf8')
)
const port = state.metro.port
const device = state.devices.ios
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const target =
  targets.find(
    (t) =>
      t.title?.startsWith('com.leviwilkerson.jwtimedev') &&
      t.deviceName === device.name
  ) ?? targets[0]
const WebSocket = createRequire(path.join(ROOT, 'package.json'))('ws')
const socket = new WebSocket(
  target.webSocketDebuggerUrl.replace('//localhost:', '//127.0.0.1:'),
  { headers: { Origin: `http://127.0.0.1:${port}` } }
)
let nextId = 1
const pending = new Map()
socket.on('message', (raw) => {
  const message = JSON.parse(raw)
  pending.get(message.id)?.(message)
  pending.delete(message.id)
})
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    socket.send(JSON.stringify({ id, method, params }))
  })
await new Promise((resolve) => socket.on('open', resolve))

await send('Profiler.enable')
await send('Profiler.setSamplingInterval', { interval: 100 })
await send('Profiler.start')
const started = Date.now()
if (command.length)
  await new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), { stdio: 'inherit' })
    child.on('exit', resolve)
  })
else await new Promise((resolve) => setTimeout(resolve, 5000))
const { result } = await send('Profiler.stop')
socket.close()
const profile = result.profile
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(profile))

const nodes = new Map(profile.nodes.map((n) => [n.id, n]))
const parent = new Map()
for (const n of profile.nodes)
  for (const c of n.children ?? []) parent.set(c, n.id)
const self = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i]
  self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0))
}
const label = (n) => {
  const f = n.callFrame
  const file = (f.url || '').split('/').pop().split('?')[0]
  return `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}`
}
const selfBy = new Map()
const inclusiveBy = new Map()
let total = 0
let idle = 0
for (const [id, us] of self) {
  const n = nodes.get(id)
  total += us
  if (
    ['(idle)', '(program)', '(garbage collector)'].includes(
      n.callFrame.functionName
    )
  ) {
    if (n.callFrame.functionName === '(idle)') idle += us
  }
  const key = label(n)
  selfBy.set(key, (selfBy.get(key) ?? 0) + us)
  const seen = new Set()
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = label(nodes.get(cur))
    if (seen.has(k)) continue
    seen.add(k)
    inclusiveBy.set(k, (inclusiveBy.get(k) ?? 0) + us)
  }
}
const ms = (us) => (us / 1000).toFixed(1)
console.log(
  `\nwall ${Date.now() - started} ms, sampled ${ms(total)} ms, busy ${ms(total - idle)} ms\n`
)
const print = (title, map) => {
  console.log(title)
  for (const [k, v] of [...map].sort((a, b) => b[1] - a[1]).slice(0, top))
    console.log(`${ms(v).padStart(9)} ms  ${k}`)
  console.log()
}
print('SELF', selfBy)
print('INCLUSIVE', inclusiveBy)
console.log(`profile: ${path.relative(ROOT, out)}`)
