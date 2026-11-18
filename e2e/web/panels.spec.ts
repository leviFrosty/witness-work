import type { Page } from '@playwright/test'
import { expect, strings, test } from './fixtures'

const en = strings('en-US')

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

async function openFromAddMenu(page: Page, item: string) {
  await page.getByRole('button', { name: en.quickAction }).click()
  await page.getByRole('dialog').getByRole('button', { name: item }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

const panel = (page: Page) => page.locator('[data-stack-layer=panel]')

test.describe('a form on a wide window', () => {
  test.beforeEach(({ app }) => {
    test.skip(isPhone(app), 'a phone window covers it with the form')
  })

  test('opens as a panel over the screen, takes focus, and Escape closes it', async ({
    app,
    shot,
  }) => {
    await openFromAddMenu(app, en.createPlan)
    await expect(
      app.getByRole('heading', { name: en.createPlan })
    ).toBeVisible()
    await expect(panel(app)).toHaveCount(1)
    await expect(app.getByRole('button', { name: en.quickAction })).toHaveCount(
      0
    )
    await expect
      .poll(() =>
        app.evaluate(
          () => !!document.activeElement?.closest('[data-stack-layer=panel]')
        )
      )
      .toBe(true)
    await shot('panel-create-plan')

    await app.keyboard.press('Escape')
    await expect(panel(app)).toHaveCount(0)
    await expect(
      app.getByRole('button', { name: en.quickAction })
    ).toBeVisible()
  })

  test('closes from its backdrop and from its Close button', async ({
    app,
  }) => {
    await openFromAddMenu(app, en.createPlan)
    await expect(
      app.getByRole('heading', { name: en.createPlan })
    ).toBeVisible()
    await app.mouse.click(12, app.viewportSize()!.height / 2)
    await expect(panel(app)).toHaveCount(0)

    await openFromAddMenu(app, en.createPlan)
    await app.getByRole('button', { name: en.close, exact: true }).click()
    await expect(panel(app)).toHaveCount(0)
  })

  test('asks before Escape drops what was typed', async ({ app }) => {
    await openFromAddMenu(app, en.addContact)
    await app.getByPlaceholder(en.name_placeholder).fill('Sam Rivera')
    const asked = new Promise<string>((resolve) =>
      app.once('dialog', async (dialog) => {
        resolve(dialog.message())
        await dialog.dismiss()
      })
    )
    await app.keyboard.press('Escape')
    expect(await asked).toBe(en.discardChanges)
    await expect(panel(app)).toHaveCount(1)
  })
})
