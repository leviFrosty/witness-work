import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({
  preferences: { role: 'regularPioneer', roleHistory: null },
  signedIn: true,
})

type Harness = {
  __WW_DEV__: {
    stores: {
      preferences: {
        getState: () => { yearProgressCards: { id: string; size: string }[] }
      }
    }
  }
}

const saved = (page: Page) =>
  page.evaluate(() =>
    (globalThis as unknown as Harness).__WW_DEV__.stores.preferences
      .getState()
      .yearProgressCards?.map((card) => `${card.id}:${card.size}`)
  )

test('the months and milestones on Progress Year resize and move', async ({
  app,
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 768, 'one column only')
  void app
  await page.getByRole('button', { name: 'Progress', exact: true }).click()
  await page.getByText('Year', { exact: true }).first().click()
  await expect(
    page.getByText('Milestones', { exact: true }).first()
  ).toBeVisible()

  const september = page.getByText(/^September, \d{4}$/)
  await expect(september).toHaveCount(1)

  await page.getByTestId('progress-edit-cards').click()
  await expect(page.getByText('Compact').first()).toBeVisible()
  await page.waitForTimeout(800)
  await page
    .getByRole('button', { name: 'Resize Months' })
    .click({ force: true })
  await expect.poll(() => saved(page)).toContain('months:full')

  await expect(page.getByText('Full Length').first()).toBeVisible()
  await page.waitForTimeout(600)
  const months = (await page.getByText('Full Length').first().boundingBox())!
  const target = (await page.getByText('AVERAGE').first().boundingBox())!
  await page.mouse.move(months.x + 20, months.y + 10)
  await page.mouse.down()
  await page.waitForTimeout(700)
  await page.mouse.move(months.x + 20, months.y - 20, { steps: 5 })
  await page.mouse.move(target.x + 30, target.y - 30, { steps: 15 })
  await page.mouse.up()
  await expect
    .poll(() => saved(page))
    .toEqual([
      'milestones:wide',
      'pace:wide',
      'months:full',
      'monthlyAverage:small',
      'studies:small',
    ])

  await expect(
    page.getByRole('button', { name: /^Remove (Service Year|Summary)$/ })
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Done', exact: true }).first().click()
  await expect(page.getByText(/^August, \d{4}$/)).toHaveCount(1)
})
