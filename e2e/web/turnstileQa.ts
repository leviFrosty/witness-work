import type { BrowserContext } from '@playwright/test'

export const BETA_VERIFY_ORIGIN = 'https://verify-beta.witnesswork.app'

const page = (token: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Security check (QA)</title></head>
<body><script>
const action = new URLSearchParams(location.search).get('action')
const message = (event) =>
  Object.assign({ protocol: 'ww-turnstile', version: 1, action }, event)
addEventListener('message', (event) => {
  if (event.source !== parent || event.data?.type !== 'init') return
  parent.postMessage(message({ type: 'ready' }), event.origin)
  parent.postMessage(message({ type: 'token', token: ${JSON.stringify(token)} }), event.origin)
})
</script></body></html>`

export async function bypassTurnstile(
  context: BrowserContext,
  token: string,
  origin = BETA_VERIFY_ORIGIN
) {
  if (!token) throw new Error('bypassTurnstile needs the QA bypass token')
  await context.route(`${origin}/**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: page(token),
    })
  )
}
