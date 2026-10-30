# Web smoke tests

Playwright tests for the web export (ADR 0037). They serve `dist/` the way the
web host does (`serve.mjs`: files as they are, `index.html` for app routes, a
real 404 for a missing chunk) and open the app in Chromium, WebKit and Firefox,
at desktop (1280×900) and phone (390×844) sizes. Every request that isn't to
the app's own server is blocked, so a run never reaches a real service.

```bash
pnpm web:build                  # dist/ for the dev profile (--env local|dev|beta|production)
pnpm web:test                   # every browser and size
pnpm web:test --project 'webkit-*'
WW_WEB_SHOTS=/tmp/shots pnpm web:test   # also save a screenshot of each screen
E2E_PORT=8790 pnpm web:test     # another port, for runs side by side
```

A run serves `dist/` on `127.0.0.1:$E2E_PORT` (8765 by default). With
`E2E_HOST` set to another host, it opens the app there and starts no server:
serve it yourself with `E2E_LISTEN=0.0.0.0 node e2e/web/serve.mjs dist <port>`.

Each test seeds the app past onboarding in a separate tab, by editing the
preferences the app saved on its first load (`fixtures.ts`), and fails on any
uncaught page error.

Install the browsers once for the pinned Playwright version with
`pnpm exec playwright install chromium webkit firefox`.

## Firefox on macOS 27

Playwright's Firefox builds don't start on macOS 27 ("Could not find profile
folder"). Run the Firefox projects in Playwright's Linux image instead, against
`dist/` served from your Mac. Use the image tag that matches the pinned
`@playwright/test`. Firefox runs headed under Xvfb with a 24-bit screen, since
headless Firefox there has no WebGL for Skia:

```bash
E2E_LISTEN=0.0.0.0 node e2e/web/serve.mjs dist 8765 &
docker run --rm --init --ipc=host --add-host=host.docker.internal:host-gateway \
  -e E2E_HOST=host.docker.internal -e E2E_PORT=8765 \
  -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble sh -c \
  'Xvfb :5 -screen 0 1920x1080x24 -nolisten tcp 2>/dev/null & sleep 2; DISPLAY=:5 \
  node node_modules/@playwright/test/cli.js test --config e2e/web/playwright.config.ts \
  --project "firefox-*" --headed --workers 2'
```

The container reaches your Mac as `host.docker.internal`, so the server listens
on `0.0.0.0`; stop it when the run ends. Start Xvfb yourself as above:
`xvfb-run` can hang waiting for the server. Docker on a Mac shares only your
home folder, so point `WW_WEB_SHOTS` inside the worktree (for example
`/work/.verify/web-shots`).
