import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({
  preferences: { role: 'regularPioneer', roleHistory: null },
  signedIn: true,
})

const menuGone = (page: Page) => expect(page.getByRole('dialog')).toHaveCount(0)

const apple = (page: Page) =>
  page.evaluate(() => /mac|iphone|ipad|ipod/i.test(navigator.platform))

const submit = async (page: Page) =>
  page.keyboard.press((await apple(page)) ? 'Meta+Enter' : 'Control+Enter')

const otherModifier = async (page: Page) =>
  page.keyboard.press((await apple(page)) ? 'Control+Enter' : 'Meta+Enter')

async function openCreatePlan(page: Page) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page.getByText('Create Plan', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create Plan' })).toBeVisible()
  await menuGone(page)
}

async function openVisitForm(page: Page) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Contact' })
    .click()
  await menuGone(page)
  await page.getByPlaceholder("What's their name?").fill('Sam Rivera')
}

test('plain Enter and the other modifier leave a form alone, and an invalid form stays open', async ({
  app,
}) => {
  await openCreatePlan(app)
  await app.getByTestId('plan-duration-pill').click()
  await app.getByRole('listbox', { name: 'Hours' }).selectOption('0')
  await app.getByRole('button', { name: 'Done' }).click()
  const title = app.getByRole('textbox', { name: 'Title' })
  await title.fill('Cart witnessing')

  await app.keyboard.press('Enter')
  await title.click()
  await otherModifier(app)
  await expect(title).toBeFocused()
  await expect(app.getByRole('heading', { name: 'Create Plan' })).toBeVisible()
  await submit(app)
  await expect(app.getByTestId('plan-save')).toBeFocused()
  await expect(app.getByRole('heading', { name: 'Create Plan' })).toBeVisible()
  await expect(app.getByText('Added plan')).toHaveCount(0)
})

test.describe('mileage', () => {
  test.use({
    preferences: {
      role: 'regularPioneer',
      roleHistory: null,
      mileageTrackingEnabled: true,
    },
  })

  test('the shortcut saves the car and trip forms, and not a trip without a distance', async ({
    app,
  }) => {
    const mileage = app.getByRole('button', { name: 'Mileage', exact: true })
    await mileage.scrollIntoViewIfNeeded()
    await mileage.click()
    await app.getByRole('button', { name: 'Add Your First Car' }).click()
    await app.getByRole('textbox', { name: 'Name', exact: true }).fill('Blue')
    await submit(app)
    await expect(app).toHaveURL(/\/Mileage$/)

    await app.getByRole('button', { name: 'Log Trip' }).click()
    const distance = app.getByRole('textbox', { name: 'Distance (mi)' })
    await distance.click()
    await submit(app)
    await expect(app).toHaveURL(/MileageTripForm/)
    await expect(app.getByRole('heading', { name: 'Log Trip' })).toBeVisible()

    await distance.fill('12')
    await submit(app)
    await expect(app).toHaveURL(/\/Mileage$/)
    await expect(app.getByRole('button', { name: 'Log Trip' })).toBeVisible()
  })
})

test('in a sheet it presses the sheet’s button, not the form underneath', async ({
  app,
}) => {
  await openCreatePlan(app)
  await app.getByRole('button', { name: 'Date', exact: true }).click()
  const date = app.locator('input[type=date]')
  await expect(date).toBeVisible()
  await date.focus()
  await submit(app)
  await expect(date).toBeHidden()
  await expect(app.getByRole('heading', { name: 'Create Plan' })).toBeVisible()
  await expect(app.getByText('Added plan')).toHaveCount(0)
})

test('a header Save button takes the shortcut', async ({ app }) => {
  await openVisitForm(app)
  await submit(app)
  await expect(app).toHaveURL(/Visit(%20| )Form/)
})

test('in the note editor it closes the editor, keeps the text and leaves the form open', async ({
  app,
}) => {
  test.skip(
    (app.viewportSize()?.width ?? 0) >= 760,
    'a wide window types the note in the form, where the shortcut saves the form (layout.spec.ts)'
  )
  await openVisitForm(app)
  await app.getByRole('button', { name: 'Save' }).click()
  await app.getByRole('button', { name: 'Note' }).first().click()
  const editor = app.getByRole('textbox', { name: 'Note' })
  await expect(editor).toBeVisible()
  await editor.click()
  await app.keyboard.type('Talked about hope')
  await app.keyboard.press('Enter')
  await app.keyboard.type('Second line')
  await expect(editor.locator('p')).toHaveCount(2)
  await expect(editor.locator('br.ProseMirror-trailingBreak')).toHaveCount(0)

  await submit(app)
  await expect(editor).toBeHidden()
  await expect(app).toHaveURL(/Visit(%20| )Form/)
  await expect(app.getByText('Talked about hope')).toBeVisible()
  await expect(app.getByText('Second line')).toBeVisible()
})
