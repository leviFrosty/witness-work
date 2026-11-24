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

  test('Tab and Shift+Tab wrap inside Contact Form modal without escaping', async ({
    app,
  }) => {
    await openFromAddMenu(app, en.addContact)
    await expect(panel(app)).toHaveCount(1)
    await expect(app.getByPlaceholder(en.name_placeholder)).toBeVisible()
    await expect
      .poll(() =>
        app.evaluate(
          () => !!document.activeElement?.closest('[data-stack-layer=panel]')
        )
      )
      .toBe(true)

    await app.keyboard.press('Tab')
    const firstSignature = await app.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el
        ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim() ?? ''}`
        : null
    })
    expect(firstSignature).toBeTruthy()

    const visited: string[] = [firstSignature!]
    let wrapped = false
    for (let step = 0; step < 60; step++) {
      await app.keyboard.press('Tab')
      const state = await app.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const inPanel = !!el?.closest('[data-stack-layer=panel]')
        const isGuard = !!el?.hasAttribute('data-ww-focus-guard')
        const inInert = !!el?.closest('[inert]')
        const sig = el
          ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim() ?? ''}`
          : null
        return { inPanel, isGuard, inInert, sig }
      })
      expect(state.inPanel, `step ${step}: focus escaped panel`).toBe(true)
      expect(state.isGuard, `step ${step}: focus rested on guard`).toBe(false)
      expect(state.inInert, `step ${step}: focus landed in inert tree`).toBe(
        false
      )
      if (state.sig === firstSignature && visited.length > 3) {
        wrapped = true
        break
      }
      if (state.sig) visited.push(state.sig)
    }

    expect(wrapped, 'Tab wrapped back to first control in modal').toBe(true)
    const lastSignature = visited.at(-1)!
    expect(lastSignature).not.toBe(firstSignature)

    await app.keyboard.press('Shift+Tab')
    const afterShiftTab = await app.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return {
        inPanel: !!el?.closest('[data-stack-layer=panel]'),
        isGuard: !!el?.hasAttribute('data-ww-focus-guard'),
        sig: el
          ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim() ?? ''}`
          : null,
      }
    })
    expect(afterShiftTab.inPanel).toBe(true)
    expect(afterShiftTab.isGuard).toBe(false)
    expect(afterShiftTab.sig).toBe(lastSignature)
  })

  test('Shift+Tab from a newly opened modal panel wraps to its last control, and nested DialogSheet traps both ways', async ({
    app,
  }) => {
    await openFromAddMenu(app, en.createPlan)
    await expect(panel(app)).toHaveCount(1)
    await expect
      .poll(() =>
        app.evaluate(
          () => !!document.activeElement?.closest('[data-stack-layer=panel]')
        )
      )
      .toBe(true)

    await app.keyboard.press('Shift+Tab')
    const wrappedBack = await app.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return {
        inPanel: !!el?.closest('[data-stack-layer=panel]'),
        isGuard: !!el?.hasAttribute('data-ww-focus-guard'),
      }
    })
    expect(wrappedBack.inPanel).toBe(true)
    expect(wrappedBack.isGuard).toBe(false)

    await app.getByRole('button', { name: 'Date', exact: true }).click()
    const sheet = app.locator('dialog[open]')
    await expect(sheet).toBeVisible()
    for (let step = 0; step < 8; step++) {
      await app.keyboard.press('Tab')
      expect(
        await app.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          return (
            !!el?.closest('dialog') && !el.hasAttribute('data-ww-focus-guard')
          )
        })
      ).toBe(true)
    }
    for (let step = 0; step < 8; step++) {
      await app.keyboard.press('Shift+Tab')
      expect(
        await app.evaluate(() => {
          const el = document.activeElement as HTMLElement | null
          return (
            !!el?.closest('dialog') && !el.hasAttribute('data-ww-focus-guard')
          )
        })
      ).toBe(true)
    }
  })
})

test('Tab and Shift+Tab wrap inside Contact Form modal on a phone window', async ({
  app,
}) => {
  test.skip(!isPhone(app), 'phone-specific full-screen modal check')
  await openFromAddMenu(app, en.addContact)
  await expect(app.getByPlaceholder(en.name_placeholder)).toBeVisible()
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          !!document.activeElement?.closest('[data-stack-layer=screen]') &&
          !document.activeElement?.closest('[inert]')
      )
    )
    .toBe(true)

  await app.keyboard.press('Tab')
  const firstSignature = await app.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return el
      ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim() ?? ''}`
      : null
  })
  expect(firstSignature).toBeTruthy()

  let wrapped = false
  let lastSignature = firstSignature!
  for (let step = 0; step < 60; step++) {
    await app.keyboard.press('Tab')
    const state = await app.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      const inActiveLayer =
        !!el?.closest('[data-stack-layer=screen]') && !el?.closest('[inert]')
      const isGuard = !!el?.hasAttribute('data-ww-focus-guard')
      const sig = el
        ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim() ?? ''}`
        : null
      return { inActiveLayer, isGuard, sig }
    })
    expect(state.inActiveLayer, `step ${step}: focus escaped modal`).toBe(true)
    expect(state.isGuard).toBe(false)
    if (state.sig === firstSignature && step > 3) {
      wrapped = true
      break
    }
    if (state.sig) lastSignature = state.sig
  }
  expect(wrapped).toBe(true)

  await app.keyboard.press('Shift+Tab')
  const back = await app.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return el
      ? `${el.tagName}:${el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.textContent?.trim() ?? ''}`
      : null
  })
  expect(back).toBe(lastSignature)
})
