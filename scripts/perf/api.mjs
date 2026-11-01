import net from 'node:net'
import path from 'node:path'
import { pidAlive } from '../verify/leases.mjs'
import {
  apiDir,
  fail,
  log,
  readJson,
  startLocalApi,
  stopLocalApi,
} from '../verify/ww-verify.mjs'

async function healthy(url) {
  try {
    const response = await fetch(new URL('/health', url), {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

function localApi(dir) {
  const before = readJson(path.join(dir, '.verify/state.json'), null)
  const started = !pidAlive(before?.pid)
  if (started) log(`starting the isolated ww-api from ${dir}`)
  return { url: startLocalApi(dir).url, started }
}

function relay(port, target) {
  const upstream = new URL(target)
  const server = net.createServer((socket) => {
    const remote = net.connect(
      Number(upstream.port || 80),
      upstream.hostname === 'localhost' ? '127.0.0.1' : upstream.hostname
    )
    socket.pipe(remote).pipe(socket)
    const close = () => {
      socket.destroy()
      remote.destroy()
    }
    socket.on('error', close)
    remote.on('error', close)
  })
  return new Promise((resolve, reject) => {
    server.once('error', (error) =>
      reject(
        error.code === 'EADDRINUSE'
          ? new Error(
              `Port ${port} is taken (another profiling run?); set WW_PERF_API_PORT and rebuild, or wait`
            )
          : error
      )
    )
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

export async function startApi({ port, apiUrl, apiDir: dirFlag }) {
  const dir = dirFlag ? path.resolve(dirFlag) : apiDir()
  const api = apiUrl
    ? { url: apiUrl, started: false, mode: 'url' }
    : { ...localApi(dir), mode: 'local' }
  if (!(await healthy(api.url)))
    fail(`The API at ${api.url} does not answer /health`)
  const server = await relay(port, api.url)
  log(`relaying 127.0.0.1:${port} to ${api.url}`)
  return {
    mode: api.mode,
    url: api.url,
    port,
    stop() {
      server.close()

      if (api.started) stopLocalApi(null, { dir })
    },
  }
}
