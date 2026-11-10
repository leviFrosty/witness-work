import type { Locator, Page } from '@playwright/test'
import { expect, readStoreRow, test } from './fixtures'

test.use({
  preferences: { role: 'regularPioneer', roleHistory: null },
  signedIn: true,
})

const menuContact = {
  id: 'e2e-menu-contact',
  createdAt: '2026-10-01T10:00:00.000Z',
  name: 'Daniel Okafor',
  address: { line1: '', line2: '', city: '', state: '', zip: '', country: '' },
  email: '',
  phone: '',
  phoneRegionCode: 'US',
  customFields: {},
  updatedAt: 1793403316101,
}

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

function daysFromNow(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    input: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    label: date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  }
}

async function openCreatePlan(page: Page) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page.getByText('Create Plan', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Create Plan' })).toBeVisible()

  await expect(page.getByRole('dialog')).toHaveCount(0)

  await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible()
}

const focusRing = (page: Page) =>
  page.evaluate(() => {
    const style = getComputedStyle(document.activeElement!)
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    }
  })

test('a plan takes a date and a time span', async ({ app, shot }) => {
  const day = daysFromNow(3)
  await openCreatePlan(app)

  await app.getByRole('button', { name: 'Date', exact: true }).click()
  const date = app.locator('input[type=date]')
  await expect(date).toBeVisible()
  await shot('date-sheet')
  await date.fill(day.input)
  await app.getByRole('button', { name: 'Done' }).click()
  await expect(
    app.getByRole('button', { name: 'Date', exact: true })
  ).not.toContainText('Today')

  await app.getByRole('button', { name: 'How long?' }).click()
  await app.getByRole('radio', { name: 'Time span' }).click()
  await app.getByRole('listbox', { name: 'Start' }).selectOption({ index: 36 })
  await app.getByRole('listbox', { name: 'End' }).selectOption({ index: 12 })
  await app.getByRole('button', { name: 'Done' }).click()
  await expect(app.getByRole('button', { name: 'How long?' })).toContainText(
    '3:00 AM – 4:05 AM'
  )

  await app.getByRole('button', { name: 'Add One Time Plan' }).click()
  await expect(app.getByText('Added plan')).toBeVisible()

  await app.getByRole('button', { name: 'Schedule', exact: true }).click()
  await app.getByRole('button', { name: new RegExp(day.label) }).click()
  await expect(app.getByText('3:00 AM', { exact: false }).first()).toBeVisible()
})

test('a time entry takes the date that was picked', async ({ app }) => {
  const day = daysFromNow(-2)
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Time' })
    .click()
  await app.getByTestId('time-entry-date-row').click()
  await app.locator('input[type=date]').fill(day.input)
  await app.getByTestId('time-entry-date-done').click()

  await app.getByTestId('time-entry-duration-pill').click()
  await app.getByRole('listbox', { name: 'Hours' }).selectOption('2')
  await app.getByRole('button', { name: 'Done' }).click()
  await app.getByTestId('time-entry-save').click()
  await expect(app.getByRole('heading', { name: 'Add Time' })).toBeHidden()

  const saved = JSON.parse(
    (await readStoreRow(app, 'mmkv.default', 'serviceReports')) as string
  ).state.serviceReports as Record<
    string,
    Record<string, { hours: number; date: string }[]>
  >
  const entries = Object.values(saved).flatMap((year) =>
    Object.values(year).flat()
  )

  const dayOf = (date: Date, utc: boolean) =>
    utc
      ? date.toISOString().slice(0, 10)
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  expect(
    entries.some(
      (entry) =>
        entry.hours === 2 &&
        [true, false].some(
          (utc) => dayOf(new Date(entry.date), utc) === day.key
        )
    )
  ).toBe(true)
})

test('a segmented choice takes the arrow keys', async ({ app }) => {
  await openCreatePlan(app)
  await app.getByRole('button', { name: 'How long?' }).click()
  const hours = app.getByRole('radio', { name: 'Just hours' })
  const span = app.getByRole('radio', { name: 'Time span' })
  await expect(hours).toHaveAttribute('aria-checked', 'true')
  await hours.focus()
  await app.keyboard.press('ArrowRight')
  await expect(span).toHaveAttribute('aria-checked', 'true')
  await expect(span).toBeFocused()
  await expect(hours).toHaveAttribute('aria-checked', 'false')
})

test('the time of a plan follows the Time Format', async ({ app }) => {
  await openCreatePlan(app)
  await app.getByRole('button', { name: 'How long?' }).click()
  await app.getByRole('radio', { name: 'Time span' }).click()
  const start = app.getByRole('listbox', { name: 'Start' })
  await expect(start.locator('option').nth(36)).toHaveText(/3:00 AM/)
})

test.describe('menus', () => {
  test.use({ seed: { contacts: [menuContact] } })

  test('a PullDownMenu opens and picks by mouse', async ({ app, shot }) => {
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByRole('button', { name: 'More actions' }).first().click()
    await expect(app.getByRole('menu')).toBeVisible()
    await shot('pulldown-menu')
    await app.getByRole('menuitem', { name: 'Select Contacts' }).click()
    await expect(app.getByRole('menu')).toBeHidden()
    await expect(app.getByText('Select Items').first()).toBeVisible()
  })

  test('a PullDownMenu is driven by the keyboard', async ({ app }) => {
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    const trigger = app.getByRole('button', { name: 'More actions' }).first()
    await trigger.focus()
    await app.keyboard.press('Enter')
    const item = app.getByRole('menuitem', { name: 'Select Contacts' })
    await expect(item).toBeFocused()

    await app.keyboard.press('Escape')
    await expect(app.getByRole('menu')).toBeHidden()
    await expect(trigger).toBeFocused()

    await app.keyboard.press('Space')
    await expect(item).toBeFocused()
    await app.keyboard.press('ArrowDown')
    await app.keyboard.press('ArrowUp')
    await app.keyboard.press('Enter')
    await expect(app.getByText('Select Items').first()).toBeVisible()
  })
  test('a ContextMenu opens on a right click', async ({ app, shot }) => {
    const day = daysFromNow(0)
    await app.getByRole('button', { name: 'Schedule', exact: true }).click()
    const cell = app.getByRole('button', { name: new RegExp(day.label) })
    await cell.click({ button: 'right' })
    await expect(app.getByRole('menu')).toBeVisible()
    await shot('context-menu')
    await app.getByRole('menuitem', { name: 'Plan This Day' }).click()
    await expect(
      app.getByRole('heading', { name: /Plan/ }).first()
    ).toBeVisible()
  })

  test('one ContextMenu opens for a day inside a card with its own', async ({
    app,
  }) => {
    test.skip(isPhone(app), 'the week strip sits below the fold of a phone')
    const day = daysFromNow(0)
    await app
      .getByRole('button', { name: new RegExp(day.label) })
      .first()
      .click({ button: 'right' })
    await expect(app.getByRole('menu')).toHaveCount(1)
  })

  test('a ContextMenu opened at the pointer closes when the page scrolls', async ({
    app,
  }) => {
    const day = daysFromNow(0)
    await app.getByRole('button', { name: 'Schedule', exact: true }).click()
    await app
      .getByRole('button', { name: new RegExp(day.label) })
      .click({ button: 'right' })
    await expect(app.getByRole('menu')).toBeVisible()

    const menu = (await app.getByRole('menu').boundingBox())!
    const below = menu.y + menu.height + 40
    await app.mouse.move(
      app.viewportSize()!.width * 0.4,
      below < app.viewportSize()!.height - 40 ? below : menu.y - 40
    )
    await app.mouse.wheel(0, 300)
    await expect(app.getByRole('menu')).toBeHidden()
  })

  test('a ContextMenu opens from the keyboard', async ({ app }) => {
    const day = daysFromNow(0)
    await app.getByRole('button', { name: 'Schedule', exact: true }).click()
    const cell = app.getByRole('button', { name: new RegExp(day.label) })
    await cell.focus()
    await app.keyboard.press('Shift+F10')
    await expect(app.getByRole('menu')).toBeVisible()
    await expect(app.getByRole('menuitem').first()).toBeFocused()
    await app.keyboard.press('Escape')
    await expect(app.getByRole('menu')).toBeHidden()
    await expect(cell).toBeFocused()
  })
})

test('an InfoPopover opens on a click and closes on Escape', async ({
  app,
  shot,
}) => {
  await app.getByRole('button', { name: 'Settings', exact: true }).click()

  if (isPhone(app))
    await app.getByRole('button', { name: 'Profile', exact: true }).click()
  const info = app.getByRole('button', { name: 'About Track Mileage' })
  await info.scrollIntoViewIfNeeded()
  await info.click()
  const popover = app.getByRole('dialog', { name: 'Track Mileage' })
  await expect(popover).toBeVisible()
  await expect(popover).toContainText(/\w{4,}/)
  await shot('info-popover')
  await app.keyboard.press('Escape')
  await expect(popover).toBeHidden()
  await expect(info).toBeFocused()
})

test('a tooltip shows when the keyboard focuses an icon-only control', async ({
  app,
}) => {
  test.skip(isPhone(app), 'the sidebar has no tabs on a phone')
  const control = app.getByRole('button', { name: 'Hide sidebar' })
  const before = await app.getByText('Hide sidebar', { exact: true }).count()

  for (let i = 0; i < 40; i++) {
    await app.keyboard.press('Tab')
    if (await control.evaluate((el) => el === document.activeElement)) break
  }
  await expect(control).toBeFocused()
  await expect
    .poll(() => app.getByText('Hide sidebar', { exact: true }).count())
    .toBeGreaterThan(before)
})

test('Log Visit can be closed', async ({ app }) => {
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Log Visit', { exact: true }).click()
  await expect(app.getByRole('heading', { name: 'Log Visit' })).toBeVisible()
  await app.getByRole('button', { name: 'Close' }).click()
  await expect(app.getByRole('heading', { name: 'Log Visit' })).toBeHidden()
})

test('a tooltip names an icon-only control under a mouse', async ({
  app,
  browserName,
}) => {
  test.skip(
    browserName === 'firefox' && isPhone(app),
    'Firefox reports a touch window’s mouse as touch'
  )
  const phone = isPhone(app)
  const label = phone ? 'Settings' : 'Hide sidebar'
  const control = phone
    ? app.getByTestId('home-settings')
    : app.getByRole('button', { name: label })
  const before = await app.getByText(label, { exact: true }).count()
  await control.hover()
  await expect
    .poll(() => app.getByText(label, { exact: true }).count())
    .toBeGreaterThan(before)
  await app.mouse.move(5, 5)
  await expect
    .poll(() => app.getByText(label, { exact: true }).count())
    .toBe(before)
})

test.describe('sheets', () => {
  test('Escape dismisses a sheet and gives focus back', async ({
    app,
    shot,
  }) => {
    await openCreatePlan(app)
    const pill = app.getByRole('button', { name: 'Date', exact: true })
    await pill.click()
    const sheet = app.locator('dialog[open]')
    await expect(sheet).toBeVisible()
    if (!isPhone(app)) {
      const box = (await sheet.boundingBox())!
      expect(box.width).toBeLessThan(700)
      expect(box.x).toBeGreaterThan(200)
    }
    await shot('sheet')
    await app.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await expect(pill).toBeFocused()
  })

  test('a click outside dismisses a dialog sheet', async ({ app }) => {
    test.skip(isPhone(app), 'a bottom sheet is dragged away on a phone')
    await openCreatePlan(app)
    await app.getByRole('button', { name: 'Date', exact: true }).click()
    const sheet = app.locator('dialog[open]')
    await expect(sheet).toBeVisible()
    await app.mouse.click(8, 8)
    await expect(sheet).toBeHidden()
  })

  test('Tab stays inside an open sheet', async ({ app }) => {
    await openCreatePlan(app)
    await app.getByRole('button', { name: 'Date', exact: true }).click()
    const sheet = app.locator('dialog[open]')
    for (let press = 0; press < 12; press++) {
      await app.keyboard.press('Tab')
      expect(
        await app.evaluate(() =>
          document.activeElement?.closest('dialog') ? true : false
        )
      ).toBe(true)
    }
    await expect(sheet).toBeVisible()
  })
})

test('Tab walks a form with a visible focus ring', async ({ app, shot }) => {
  await openCreatePlan(app)
  await app.getByRole('button', { name: 'Go Back' }).focus()
  let stops = 0
  for (let press = 0; press < 8; press++) {
    await app.keyboard.press('Tab')

    const where = await app.evaluate(() =>
      document.activeElement?.outerHTML.slice(0, 160)
    )
    await expect
      .poll(async () => (await focusRing(app)).style, {
        message: `tab stop ${press + 1}: ${where}`,
      })
      .toBe('solid')
    expect((await focusRing(app)).width).toBeGreaterThanOrEqual(2)
    stops++
  }
  expect(stops).toBe(8)
  await shot('focus-ring')
})

test('Contacts has a search field that takes typing', async ({ app, shot }) => {
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  const search = app.getByTestId('contacts-search')
  await expect(search).toBeVisible()
  const box = (await search.boundingBox())!
  expect(box.width).toBeGreaterThan(120)
  expect(box.height).toBeGreaterThan(20)
  await search.fill('Zed')
  await expect(search).toHaveValue('Zed')
  await expect(app.getByText('No matches').first()).toBeVisible()
  await shot('contacts-search')
})

test.describe('at a tablet width', () => {
  test.use({ viewport: { width: 1024, height: 768 } })

  test('the main screens fit the window', async ({ app }) => {
    const overflow = () =>
      app.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
    await expect.poll(overflow).toBeLessThanOrEqual(0)
    for (const tab of ['Contacts', 'Schedule']) {
      await app.getByRole('button', { name: tab, exact: true }).click()
      await expect.poll(overflow, { message: tab }).toBeLessThanOrEqual(0)
    }
    await app.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect.poll(overflow, { message: 'Settings' }).toBeLessThanOrEqual(0)
  })
})

async function addContact(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add Contact' }).first().click()
  await page.getByPlaceholder("What's their name?").fill(name)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByPlaceholder("What's their name?")).toBeHidden()

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Quick Action' })).toBeVisible()
}

const reachable = (target: Locator) =>
  target.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const hit = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2
    )
    return hit !== null && el.contains(hit)
  })

const sizeOf = async (target: Locator) => (await target.boundingBox())!

test.describe('dismissing a picker cancels it', () => {
  for (const how of ['Escape', 'a click outside'] as const) {
    const dismiss = async (app: Page) => {
      if (how === 'Escape') await app.keyboard.press('Escape')
      else await app.mouse.click(8, 8)
    }

    test(`${how} keeps the date`, async ({ app }) => {
      await openCreatePlan(app)
      const pill = app.getByRole('button', { name: 'Date', exact: true })
      const before = await pill.textContent()
      await pill.click()
      await app.locator('input[type=date]').fill(daysFromNow(5).input)
      await dismiss(app)
      await expect(app.locator('dialog[open]')).toBeHidden()
      await expect(pill).toHaveText(before!)
    })

    test(`${how} keeps How long?`, async ({ app }) => {
      await openCreatePlan(app)
      const pill = app.getByRole('button', { name: 'How long?' })
      const before = await pill.textContent()
      await pill.click()
      await app.getByRole('listbox', { name: 'Hours' }).selectOption('3')
      await dismiss(app)
      await expect(app.locator('dialog[open]')).toBeHidden()
      await expect(pill).toHaveText(before!)
    })
  }

  test('Done still keeps the edit', async ({ app }) => {
    await openCreatePlan(app)
    const pill = app.getByRole('button', { name: 'Date', exact: true })
    await pill.click()
    await app.locator('input[type=date]').fill(daysFromNow(5).input)
    await app.getByRole('button', { name: 'Done' }).click()
    await expect(pill).not.toContainText('Today')
  })
})

test('a date typed into the picker keeps its digits', async ({
  app,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'only Chromium sends a change for each typed part'
  )
  await openCreatePlan(app)
  const pill = app.getByRole('button', { name: 'Date', exact: true })
  await pill.click()
  const date = app.locator('input[type=date]')

  await date.focus()
  await app.keyboard.type('01152027', { delay: 50 })
  await expect(date).toHaveValue('2027-01-15')

  await app.keyboard.press('Enter')
  await expect(app.locator('dialog[open]')).toBeHidden()
  await expect(pill).toContainText('2027')
})

test('dialogs are named after what they hold', async ({ app }) => {
  await openCreatePlan(app)
  await app.getByRole('button', { name: 'Date', exact: true }).click()
  const sheet = app.locator('dialog[open]')
  await expect(sheet).toHaveAccessibleName('Date')
  await app.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await app.getByRole('button', { name: 'How long?' }).click()
  await expect(sheet).toHaveAccessibleName('How long?')
  await app.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('a segmented choice says which is chosen', async ({ app }) => {
  await openCreatePlan(app)
  const once = app.getByRole('button', { name: 'One Time', exact: true })
  const recurring = app.getByRole('button', { name: 'Recurring', exact: true })
  await expect(once).toHaveAttribute('aria-pressed', 'true')
  await expect(recurring).toHaveAttribute('aria-pressed', 'false')
  await recurring.click()
  await expect(recurring).toHaveAttribute('aria-pressed', 'true')
  await expect(once).toHaveAttribute('aria-pressed', 'false')
  expect((await sizeOf(once)).height).toBeGreaterThanOrEqual(44)

  await app.getByRole('button', { name: 'Go Back' }).click()
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(app.getByRole('button', { name: 'List' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(app.getByRole('button', { name: 'Map' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
})

test('picker buttons are touch sized', async ({ app }) => {
  await openCreatePlan(app)
  await app.getByRole('button', { name: 'Date', exact: true }).click()
  for (const name of ['Cancel', 'Done']) {
    const button = app.getByRole('button', { name })

    await expect
      .poll(async () => (await sizeOf(button)).height, { message: name })
      .toBeGreaterThanOrEqual(44)
    expect((await sizeOf(button)).width, name).toBeGreaterThanOrEqual(44)
  }
})

test('the time fields of a visit are touch sized', async ({ app }) => {
  await app.getByRole('button', { name: 'Add Contact' }).first().click()
  await app.getByPlaceholder("What's their name?").fill('Sam Rivera')
  await app.getByRole('button', { name: 'Save' }).click()
  const hour = app.getByRole('combobox', { name: 'Hour' }).first()
  await expect(hour).toBeVisible()
  for (const name of ['Hour', 'Minutes', 'AM / PM']) {
    const box = await sizeOf(app.getByRole('combobox', { name }).first())
    expect(box.height, name).toBeGreaterThanOrEqual(44)
  }
})

test.describe('menus', () => {
  test.use({ seed: { contacts: [menuContact] } })

  test('menu items are touch sized', async ({ app }) => {
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByRole('button', { name: 'More actions' }).first().click()
    const item = app.getByRole('menuitem').first()
    expect((await sizeOf(item)).height).toBeGreaterThanOrEqual(44)
  })

  test('menu items show their icons, in the color of their title', async ({
    app,
  }) => {
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByText('Daniel Okafor').first().click({ button: 'right' })
    const edit = app.getByRole('menuitem', { name: 'Edit' })
    await expect(edit.locator('[data-menu-icon="pencil"] svg')).toBeVisible()
    expect((await sizeOf(edit)).height).toBeGreaterThanOrEqual(44)

    const remove = app.getByRole('menuitem', { name: /^Delete/ })
    const icon = remove.locator('[data-menu-icon="trash"] svg')
    await expect(icon).toBeVisible()
    const colors = await remove.evaluate((item) => [
      getComputedStyle(item).color,
      getComputedStyle(item.querySelector('svg')!).stroke,
      getComputedStyle(document.querySelector('[role=menuitem]')!).color,
    ])
    expect(colors[1]).toBe(colors[0])
    expect(colors[0]).not.toBe(colors[2])
  })

  test('an open menu follows its trigger when the window resizes', async ({
    app,
  }) => {
    test.skip(isPhone(app), 'a phone window keeps its width')
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    const trigger = app.getByRole('button', { name: 'More actions' }).first()
    await trigger.click()
    const menu = app.getByRole('menu')
    await expect(menu).toBeVisible()
    const alignedToTrigger = async () => {
      const [t, m] = [await sizeOf(trigger), await sizeOf(menu)]
      return Math.abs(t.x + t.width - (m.x + m.width))
    }
    expect(await alignedToTrigger()).toBeLessThanOrEqual(2)

    const before = await sizeOf(trigger)
    await app.setViewportSize({
      width: 700,
      height: app.viewportSize()!.height,
    })
    await expect.poll(async () => (await sizeOf(trigger)).x).not.toBe(before.x)
    await expect.poll(alignedToTrigger).toBeLessThanOrEqual(2)
  })

  test('Arrow Left out of a submenu returns to its item', async ({ app }) => {
    await addContact(app, 'Sam Rivera')
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByText('Sam Rivera').first().click()
    const more = app.getByRole('button', { name: 'More actions' }).last()
    await more.focus()
    await app.keyboard.press('Enter')
    const parent = app.getByRole('menuitem', { name: 'Dismiss For' })
    await parent.focus()
    await app.keyboard.press('ArrowRight')

    await expect(app.getByRole('menuitem', { name: 'Edit' })).toBeHidden()
    await app.keyboard.press('ArrowLeft')
    await expect(parent).toBeFocused()
  })
})

test.describe('tooltips', () => {
  test.use({ seed: { contacts: [menuContact] } })

  test('a keyboard names an icon-only menu button', async ({ app }) => {
    test.skip(isPhone(app), 'a phone has no pointer to name controls for')
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    const more = app.getByRole('button', { name: 'More actions' }).first()
    await more.focus()
    await app.keyboard.press('Shift+Tab')
    await app.keyboard.press('Tab')
    await expect(more).toBeFocused()
    const tip = app.getByRole('tooltip')
    await expect(tip).toHaveText('More actions')
    const id = await tip.getAttribute('id')
    await expect(more).toHaveAttribute('aria-describedby', id!)
    await app.keyboard.press('Shift+Tab')
    await expect(tip).toBeHidden()
    await expect(more).not.toHaveAttribute('aria-describedby', /./)
  })

  test('the favorite star has a tooltip', async ({ app }) => {
    test.skip(isPhone(app), 'a phone has no pointer to name controls for')
    await addContact(app, 'Sam Rivera')
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByText('Sam Rivera').first().click()
    await app.getByRole('button', { name: 'Add to Favorites' }).hover()
    await expect(app.getByRole('tooltip')).toHaveText('Add to Favorites')
  })
})

test.describe('at 1024 px and wider', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, 'wide windows')

  test('Plan Details has header buttons a mouse can click', async ({ app }) => {
    const day = daysFromNow(3)
    await openCreatePlan(app)
    await app.getByPlaceholder('Title (Optional)').fill('Cart')
    await app.getByRole('button', { name: 'Date', exact: true }).click()
    await app.locator('input[type=date]').fill(day.input)
    await app.getByRole('button', { name: 'Done' }).click()
    await app.getByRole('button', { name: 'How long?' }).click()
    await app.getByRole('radio', { name: 'Time span' }).click()
    await app.getByRole('button', { name: 'Done' }).click()
    await app.getByRole('button', { name: 'Add One Time Plan' }).click()
    await expect(app.getByText('Added plan')).toBeVisible()
    await app.getByRole('button', { name: 'Schedule', exact: true }).click()
    await app.getByRole('button', { name: new RegExp(day.label) }).click()
    await app.getByRole('button', { name: /Cart/ }).first().click()

    const header = app.getByRole('button', { name: 'Edit', exact: true })
    await expect(header).toBeVisible()
    for (const name of ['Go Back', 'Edit', 'More']) {
      const control = app.getByRole('button', { name, exact: true }).last()
      expect(await reachable(control), name).toBe(true)
    }

    const bar = await sizeOf(header)
    const title = await sizeOf(app.getByText('Cart', { exact: true }).last())
    expect(title.y).toBeGreaterThanOrEqual(bar.y + bar.height - 2)
    await header.click()
    await expect(app.getByRole('button', { name: /Save|Update/ })).toBeVisible()
  })

  test('the contacts filter chips scroll with a mouse wheel', async ({
    app,
  }) => {
    test.skip(isPhone(app), 'a phone swipes its chips')
    await addContact(app, 'Sam Rivera')
    await app.getByRole('button', { name: 'Contacts', exact: true }).click()
    await app.getByText('Sam Rivera').first().click()
    const info = app.getByRole('button', { name: 'What the colors mean' })

    const chip = app.getByRole('button', { name: /^Stale/ })
    await expect(chip).toBeVisible()
    const box = await sizeOf(chip)
    await app.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(async () => reachable(info)).toBe(false)
    for (let i = 0; i < 6 && !(await reachable(info)); i++) {
      await app.mouse.wheel(0, 200)
      await app.waitForTimeout(150)
    }
    expect(await reachable(info)).toBe(true)
  })
})

test.describe('icon buttons', () => {
  test('a small icon button has a full-size frame', async ({ app }) => {
    const bell = app.getByTestId('notifications-bell')
    await expect(bell).toBeVisible()
    const box = await sizeOf(bell)
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)

    await openCreatePlan(app)
    const back = await sizeOf(app.getByRole('button', { name: 'Go Back' }))
    expect(back.width).toBeGreaterThanOrEqual(44)
    expect(back.height).toBeGreaterThanOrEqual(44)
  })
})

test.describe('pointer hover', () => {
  test('a mouse tints a small button and leaving clears it', async ({
    app,
  }) => {
    test.skip(isPhone(app), 'a phone has no mouse')
    const control = app.getByRole('button', { name: 'Hide sidebar' })
    const tint = control.getByTestId('hover-tint')
    await expect(tint).toHaveCount(0)
    await control.hover()
    await expect(tint).toHaveCount(1)

    await expect(tint).toHaveCSS('opacity', '0.12')
    await app.mouse.move(5, 5)
    await expect(tint).toHaveCount(0)
  })
})

test.describe('a touch screen', () => {
  test.use({ hasTouch: true })

  test('a tap leaves no hover behind', async ({ app }) => {
    test.skip(!isPhone(app), 'a phone window')
    await app.getByTestId('notifications-bell').tap()
    await expect(app.getByTestId('hover-tint')).toHaveCount(0)
  })
})
