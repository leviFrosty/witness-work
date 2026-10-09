// The backend for a profiling run. Release bundles bake their API URL in, so
// the bundle always calls 127.0.0.1:WW_PERF_API_PORT and this relays it to an
// isolated ww-api (ww-api's scripts/verify/dev.mjs, on whatever port it got).
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fail, log, run } from '../verify/ww-verify.mjs'

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

function devScript(apiDir) {
  const script = path.join(apiDir, 'scripts/verify/dev.mjs')
  if (!fs.existsSync(script))
    fail(
      `${script} not found; set WW_API_DIR (or --api-dir) to a ww-api checkout that has scripts/verify/dev.mjs, e.g. a worktree at origin/main`
    )
  return script
}

/** Starts (or reuses) the isolated ww-api; returns its URL. */
async function localApi(apiDir) {
  const script = devScript(apiDir)
  const current = run('node', [script, 'url'], { cwd: apiDir, check: false })
  const url = current.stdout.trim().split('\n').pop()
  if (current.status === 0 && url && (await healthy(url)))
    return { url, started: false }
  log(`starting the isolated ww-api from ${apiDir}`)
  run('node', [script, 'up'], {
    cwd: apiDir,
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 180_000,
  })
  return {
    url: run('node', [script, 'url'], { cwd: apiDir }).stdout.trim(),
    started: true,
  }
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

/**
 * The API for a run: `apiUrl` when given (an existing ww-api), else the
 * isolated one from `apiDir`. Returns what to record and a `stop()`.
 */
export async function startApi({ port, apiUrl, apiDir }) {
  const dir =
    apiDir || process.env.WW_API_DIR || path.join(os.homedir(), 'dev/ww-api')
  const api = apiUrl
    ? { url: apiUrl, started: false, mode: 'url' }
    : { ...(await localApi(dir)), mode: 'local' }
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
      if (api.started)
        run('node', [devScript(dir), 'down'], { cwd: dir, check: false })
    },
  }
}
