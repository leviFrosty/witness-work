import { expect, profile, strings, test } from './fixtures'

test.use({ signedIn: true })

test('the app’s fonts load from its own origin', async ({ app }) => {
  const failed: string[] = []
  const origin = new URL(app.url()).origin
  app.on('response', (response) => {
    if (response.url().startsWith(origin) && response.status() >= 400)
      failed.push(response.url())
  })
  await app.reload()
  await expect(app.getByRole('button', { name: 'Create Plan' })).toBeVisible()
  const families = [
    'Inter_400Regular',
    'Inter_500Medium',
    'Inter_600SemiBold',
    'Inter_700Bold',
  ]
  const faces = await app.evaluate(async (families) => {
    await document.fonts.ready
    await Promise.all(
      families.map((family) =>
        document.fonts.load(`16px ${family}`).catch(() => [])
      )
    )

    return [...document.fonts].map((face) => [
      face.family.replace(/^"(.*)"$/, '$1'),
      face.status,
    ])
  }, families)
  for (const family of families)
    expect(faces, family).toContainEqual([family, 'loaded'])
  expect(faces.filter(([, status]) => status === 'error')).toEqual([])
  expect(failed).toEqual([])
})

test('Help Center search asks this environment’s search service', async ({
  app,
}) => {
  const site = new URL(profile.helpManifest).origin
  const requested: string[] = []

  await app.route(`${site}/**`, (route) => {
    requested.push(route.request().url())
    return route.fulfill({ status: 503 })
  })
  await app.route(`${profile.helpSearchOrigin}/**`, (route) => {
    requested.push(route.request().url())
    return route.fulfill({
      json: { results: [] },
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  })
  await app.getByRole('button', { name: 'Settings', exact: true }).click()
  await app.getByRole('button', { name: 'Help Center', exact: true }).click()
  await expect(
    app.getByRole('button', { name: 'Jump to Still Need Help' })
  ).toBeVisible()
  await app
    .getByPlaceholder(strings('en-US').faq_searchPlaceholder)
    .fill('service year')
  await expect
    .poll(() =>
      requested.find((url) => url.startsWith(`${profile.helpSearchOrigin}/`))
    )
    .toMatch(/\/v1\/search\?q=service\+year&/)

  expect(
    requested.some((url) => url.startsWith(`${site}/help/bundle/manifest.json`))
  ).toBe(true)
  for (const url of requested)
    expect([site, profile.helpSearchOrigin]).toContain(new URL(url).origin)
})

test('the note editor writes and takes pasted HTML under the CSP', async ({
  app,
}) => {
  const en = strings('en-US')
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  await app.getByRole('button', { name: en.addContact }).first().click()
  await app.getByPlaceholder(en.name_placeholder).fill('Maria Santos')
  await app.getByRole('button', { name: 'Save' }).click()

  await app.getByText(en.note_placeholder).first().click()
  const editor = app.locator('.ProseMirror[contenteditable=true]')
  await expect(editor).toBeVisible()
  await editor.click()
  await app.keyboard.type('Talked about the garden. ')

  await editor.evaluate((element) =>
    (
      element as unknown as {
        editor: { view: { pasteHTML: (html: string) => boolean } }
      }
    ).editor.view.pasteHTML(
      '<p>Shared <b>a verse</b> from <a href="https://www.jw.org/en/">jw.org</a></p>'
    )
  )
  await expect(editor).toContainText('Talked about the garden.')
  await expect(editor.locator('strong'), await editor.innerHTML()).toHaveText(
    'a verse'
  )
  await expect(editor.locator('a')).toHaveAttribute(
    'href',
    'https://www.jw.org/en/'
  )
})
