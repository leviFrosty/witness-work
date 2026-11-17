import { expect, profile, test } from './fixtures'

test.use({ signedIn: true })

test('a signed-in browser shows Buddies even when PostHog is blocked', async ({
  app,
  context,
  shot,
}) => {
  const proxy = new URL(profile.posthogOrigin).hostname
  await context.route(
    (url) => url.hostname === proxy || url.hostname.endsWith('posthog.com'),
    (route) => route.abort('blockedbyclient')
  )
  await app.reload()

  await app.getByRole('button', { name: 'Schedule', exact: true }).click()
  await expect(app.getByTestId('buddies-row-schedule_row')).toBeVisible()
  await shot('schedule-buddies-row')
})
