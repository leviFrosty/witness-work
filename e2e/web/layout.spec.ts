import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

/**
 * Layout and navigation on the web (ADR 0037 §1): every screen scrolls and
 * closes, the keyboard stays on the screen that's showing, headers have a body
 * and every control is a fingertip big.
 */

test.use({
  preferences: { role: 'regularPioneer', roleHistory: null },
  signedIn: true,
})

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768

/** The smallest tap target on the web (AGENTS.md, "Touch targets"). */
const MIN = 44

/** A control's frame, which must be a real one: `hitSlop` doesn't exist here. */
async function expectTarget(page: Page, name: string | RegExp, exact = true) {
  const control = page
    .getByRole('button', { name, exact: typeof name === 'string' && exact })
    .filter({ visible: true })
    .first()
  await expect(control).toBeVisible()
  const box = (await control.boundingBox())!
  expect(box.width, `${name} width`).toBeGreaterThanOrEqual(MIN - 0.5)
  expect(box.height, `${name} height`).toBeGreaterThanOrEqual(MIN - 0.5)
  // Nothing sits over it, so a click lands on the control itself.
  const hit = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const top = document.elementFromPoint(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2
    )
    return top && element.contains(top)
      ? ''
      : `${top?.tagName} ${top?.getAttribute('aria-label') ?? ''} at ${Math.round(rect.x)},${Math.round(rect.y)}`
  })
  expect(hit, `${name} is covered by`).toBe('')
}

/** The Add menu has finished leaving, so it isn't over the screen it opened. */
const menuGone = (page: Page) => expect(page.getByRole('dialog')).toHaveCount(0)

/** A contact through Add Contact, which then opens its visit form. */
async function addContact(page: Page, name: string) {
  await page.getByRole('button', { name: 'Quick Action' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Add Contact' })
    .click()
  await menuGone(page)
  await page.getByPlaceholder("What's their name?").fill(name)
}

/** Scrolls Home with the wheel until `target` is in the window. */
async function wheelInto(page: Page, target: ReturnType<Page['getByRole']>) {
  const size = page.viewportSize()!
  await page.mouse.move(size.width / 2, size.height / 2)
  for (let step = 0; step < 12; step++) {
    const box = await target.boundingBox()
    if (box && box.y >= 0 && box.y + box.height <= size.height) return
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(150)
  }
}

for (const size of [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1280, height: 900 },
]) {
  test(`Home scrolls to its last section at ${size.width}×${size.height}`, async ({
    app,
    shot,
  }) => {
    await app.setViewportSize(size)
    const edit = app.getByRole('button', { name: /Edit Home Screen/ })
    await wheelInto(app, edit)
    const box = (await edit.boundingBox())!
    expect(box.y, 'Edit Home Screen is above the fold').toBeGreaterThanOrEqual(
      0
    )
    expect(box.y + box.height).toBeLessThanOrEqual(size.height)
    await shot(`home-scrolled-${size.width}`)
    // The timer, which sits above it, is reachable too.
    const timer = app.getByRole('button', { name: /Start timer/ })
    await wheelInto(app, timer)
    await expect(timer).toBeInViewport()
  })
}

test('Home scrolls by a touch swipe', async ({ app, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'Playwright has no touch swipe elsewhere'
  )
  const size = app.viewportSize()!
  const edit = app.getByRole('button', { name: /Edit Home Screen/ })
  const cdp = await app.context().newCDPSession(app)
  for (let swipe = 0; swipe < 6; swipe++) {
    const box = await edit.boundingBox()
    if (box && box.y + box.height <= size.height) break
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(size.width / 2),
      y: Math.round(size.height * 0.7),
      yDistance: -500,
      gestureSourceType: 'touch',
      speed: 1200,
    })
    await app.waitForTimeout(300)
  }
  const box = (await edit.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(size.height)
})

test.describe('the note editor', () => {
  test.beforeEach(async ({ app }) => {
    await addContact(app, 'Sam Rivera')
    await app.getByRole('button', { name: 'Save' }).click()
    await app.getByRole('button', { name: 'Note' }).first().click()
    await expect(app.getByRole('textbox', { name: 'Note' })).toBeVisible()
  })

  test('Done is a fingertip big and closes it', async ({ app, shot }) => {
    await shot('note-editor')
    await expectTarget(app, 'Done')
    await app.getByRole('button', { name: 'Done' }).click()
    await expect(app.getByRole('textbox', { name: 'Note' })).toBeHidden()
    await expect(app).toHaveURL(/Visit(%20| )Form/)
  })

  test('Escape closes it and keeps the text, as Done does', async ({ app }) => {
    await app.getByRole('textbox', { name: 'Note' }).click()
    await app.keyboard.type('Talked about hope')
    await app.keyboard.press('Escape')
    await expect(app.getByRole('textbox', { name: 'Note' })).toBeHidden()
    await expect(app).toHaveURL(/Visit(%20| )Form/)
    await expect(app.getByText('Talked about hope')).toBeVisible()
  })

  test('a long note scrolls inside the editor and keeps Done in view', async ({
    app,
  }) => {
    await app.getByRole('textbox', { name: 'Note' }).click()
    for (let line = 0; line < 60; line++) {
      await app.keyboard.type(`Line ${line}`)
      await app.keyboard.press('Enter')
    }
    // The caret follows the typing to the end without scrolling the page
    // (which is clipped, so nothing could bring the header back).
    const done = (await app
      .getByRole('button', { name: 'Done' })
      .boundingBox())!
    expect(done.y).toBeGreaterThanOrEqual(0)
    expect(
      await app.evaluate(() => document.scrollingElement?.scrollTop ?? 0),
      'the page was scrolled'
    ).toBe(0)
    // The end of the note is in view, inside the window.
    const last = (await app.getByText('Line 59').boundingBox())!
    expect(last.y + last.height).toBeLessThanOrEqual(app.viewportSize()!.height)
    // And the top is still there to scroll back to.
    await app.getByText('Line 0', { exact: true }).scrollIntoViewIfNeeded()
    await expect(app.getByRole('button', { name: 'Done' })).toBeInViewport()
  })

  test('its formatting tools are fingertip big', async ({ app }) => {
    await expectTarget(app, 'Bold')
  })
})

test('Add Contact and the visit form have a header with fingertip controls', async ({
  app,
  shot,
}) => {
  await addContact(app, 'Alex Moreno')
  await expectTarget(app, 'Go Back')
  await expectTarget(app, 'Save')
  // The header has a body: the first section sits below it, not under the
  // controls.
  const save = (await app.getByRole('button', { name: 'Save' }).boundingBox())!
  const label = (await app
    .getByText('Add Contact', { exact: true })
    .last()
    .boundingBox())!
  expect(label.y).toBeGreaterThanOrEqual(save.y + save.height - 12)
  await shot('add-contact-header')

  await app.getByRole('button', { name: 'Save' }).click()
  await expect(app).toHaveURL(/Visit(%20| )Form/)
  await expectTarget(app, 'Skip')
  await expectTarget(app, 'Add')
  await shot('visit-form-header')
})

test('Tab stays on the screen that is showing', async ({ app }) => {
  test.skip(isPhone(app), 'a phone has no sidebar to tab out of')
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(app.getByRole('button', { name: 'List' })).toBeVisible()
  const header = app.getByRole('heading', { name: 'Contacts', exact: true })
  const before = (await header.boundingBox())!

  await app
    .getByRole('button', { name: 'Contacts', exact: true })
    .first()
    .focus()
  const strays: string[] = []
  for (let press = 0; press < 40; press++) {
    await app.keyboard.press('Tab')
    const where = await app.evaluate(() => {
      const element = document.activeElement as HTMLElement
      return {
        label: (element.getAttribute('aria-label') ?? element.innerText ?? '')
          .replace(/\s+/g, ' ')
          .slice(0, 30),
        inInert: !!element.closest('[inert]'),
        visible: element === document.body || element.checkVisibility(),
        // The hidden tabs are in the page but out of the accessibility tree
        // (`aria-hidden`): focus in one is a control nobody can see or hear.
        ariaHidden: !!element.closest('[aria-hidden="true"]'),
      }
    })
    if (where.inInert || !where.visible || where.ariaHidden)
      strays.push(`${press}: ${where.label} (hidden)`)
  }
  expect(strays, 'Tab reached a screen that is not showing').toEqual([])

  // The clipped container the hidden screens sat in wasn't scrolled to them.
  const after = (await header.boundingBox())!
  expect(after.y).toBe(before.y)
})

test('a screen left by a tab keeps its state and leaves the tab order', async ({
  app,
}) => {
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  const search = app.getByRole('textbox', { name: /Search/i }).first()
  await search.fill('Rivera')
  await app.getByRole('button', { name: 'Home', exact: true }).first().click()
  await expect(app.getByRole('button', { name: 'Quick Action' })).toBeVisible()
  // Contacts is out of the accessibility tree and the tab order, but not
  // unmounted: its search field is still in the page, inert, with its text.
  await expect(app.getByRole('textbox', { name: /Search/i })).toHaveCount(0)
  const kept = app.locator('input[placeholder^="Search"]')
  await expect(kept).toHaveValue('Rivera')
  expect(await kept.evaluate((input) => !!input.closest('[inert]'))).toBe(true)
  await app.getByRole('button', { name: 'Contacts', exact: true }).click()
  await expect(search).toHaveValue('Rivera')
})

test("keyboard focus never scrolls Home's header away", async ({ app }) => {
  test.skip(isPhone(app), 'checked at desktop and tablet sizes')
  for (const size of [
    { width: 1280, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await app.setViewportSize(size)
    const title = app
      .getByRole('heading', { name: 'Home', exact: true })
      .filter({ visible: true })
      .first()
    const before = (await title.boundingBox())!
    await app.getByRole('button', { name: 'Quick Action' }).focus()
    for (let press = 0; press < 6; press++) await app.keyboard.press('Tab')
    const after = (await title.boundingBox())!
    expect(after.y, `at ${size.width}`).toBe(before.y)
    // Nothing that clips and shouldn't scroll was scrolled.
    const scrolled = await app.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('*')].filter((element) => {
          const style = getComputedStyle(element)
          return (
            style.overflowY === 'hidden' &&
            (element.scrollTop !== 0 || element.scrollLeft !== 0)
          )
        }).length
    )
    expect(scrolled, `clipped containers scrolled at ${size.width}`).toBe(0)
  }
})

test('base controls are a fingertip big', async ({ app }) => {
  await expectTarget(app, /^Notifications/)
  await wheelInto(
    app,
    app.getByRole('button', { name: 'View full schedule', exact: true })
  )
  await expectTarget(app, 'View full schedule')
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Create Plan', { exact: true }).click()
  await menuGone(app)
  await expectTarget(app, 'Go Back')
})

test('a Switch is a fingertip big and toggles from its frame', async ({
  app,
}) => {
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Create Plan', { exact: true }).click()
  await menuGone(app)
  await app.getByRole('button', { name: 'Recurring' }).click()
  const toggle = app.getByRole('switch', { name: 'End Date' })
  await expect(toggle).toBeAttached()
  const frame = toggle.locator('xpath=ancestor::div[2]')
  await frame.scrollIntoViewIfNeeded()
  // The frame is a press target, not a second tab stop beside the switch.
  expect(await frame.getAttribute('tabindex')).not.toBe('0')
  const box = (await frame.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(MIN - 0.5)
  expect(box.height).toBeGreaterThanOrEqual(MIN - 0.5)
  // The frame's corner, outside the 40×20 switch. The form is still settling
  // as it opens (longer in Firefox), so wait for the frame to stop moving, and
  // try a press that lands early again.
  await expect
    .poll(async () => {
      const first = (await frame.boundingBox())!.y
      await app.waitForTimeout(150)
      return (await frame.boundingBox())!.y === first
    })
    .toBe(true)
  await expect(async () => {
    const at = (await frame.boundingBox())!
    const before = await toggle.isChecked()
    await app.mouse.click(at.x + 2, at.y + 2)
    await expect(toggle).toBeChecked({ checked: !before, timeout: 1000 })
  }).toPass()
})

test('the plan form starts at the top on a narrow window with a mouse', async ({
  app,
}) => {
  test.skip(!isPhone(app), 'a desktop window already starts at the top')
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Create Plan', { exact: true }).click()
  const title = app.getByPlaceholder('Title (Optional)')
  const box = (await title.boundingBox())!
  expect(box.y).toBeLessThan(260)
})

test.describe('with decimal hours', () => {
  test.use({
    preferences: {
      role: 'regularPioneer',
      roleHistory: null,
      timeDisplayFormat: 'decimal',
    },
  })

  test('1 h 45 m reads 1.8 in the entry and in the total', async ({ app }) => {
    await app.getByRole('button', { name: 'Quick Action' }).click()
    await app
      .getByRole('dialog')
      .getByRole('button', { name: 'Add Time' })
      .click()
    await app.getByTestId('time-entry-duration-pill').click()
    await app.getByRole('listbox', { name: 'Hours' }).selectOption('1')
    await app.getByRole('listbox', { name: 'Minutes' }).selectOption('45')
    await app.getByRole('button', { name: 'Done' }).click()
    await app.getByRole('button', { name: 'Submit' }).click()
    await expect(app.getByText('1.8 Hrs added')).toBeVisible()
    await expect(app.getByText(/^1\.8 Hrs of \d+ Hrs/)).toBeVisible()
  })
})

test('a plan with no length says so', async ({ app }) => {
  await app.getByRole('button', { name: 'Quick Action' }).click()
  await app.getByText('Create Plan', { exact: true }).click()
  await expect(app.getByText('Choose a length of time.')).toBeHidden()
  await app.getByRole('button', { name: 'Add One Time Plan' }).click()
  await expect(app.getByText('Choose a length of time.')).toBeVisible()
})

test('a link to a contact that is gone says so', async ({ app, shot }) => {
  await app.goto('/contact/00000000-0000-0000-0000-000000000000')
  await expect(
    app.getByRole('heading', { name: 'Contact not found' })
  ).toBeVisible()
  await expect(app.getByText(/for ID/)).toHaveCount(0)
  await shot('contact-not-found')
  await app.getByRole('button', { name: 'Go to Contacts' }).click()
  await expect(app.getByRole('button', { name: 'List' })).toBeVisible()
})

test.describe('Mileage', () => {
  test.use({
    preferences: {
      role: 'regularPioneer',
      roleHistory: null,
      mileageTrackingEnabled: true,
    },
  })

  test('its header leaves the title clear and its controls are fingertip big', async ({
    app,
    shot,
  }) => {
    await wheelInto(
      app,
      app.getByRole('button', { name: 'Mileage', exact: true })
    )
    await app.getByRole('button', { name: 'Mileage', exact: true }).click()
    const title = app.getByRole('heading', { name: 'Mileage' })
    await expect(title).toBeVisible()
    await shot('mileage')
    const titleBox = (await title.boundingBox())!
    for (const name of ['Share Report', 'Mileage Settings']) {
      await expectTarget(app, name)
      const box = (await app.getByRole('button', { name }).boundingBox())!
      const overlaps =
        box.x < titleBox.x + titleBox.width &&
        box.x + box.width > titleBox.x &&
        box.y < titleBox.y + titleBox.height &&
        box.y + box.height > titleBox.y
      expect(overlaps, `${name} overlaps the title`).toBe(false)
    }
    // The two frames don't overlap, so a tap on one can't land on the other.
    const share = (await app
      .getByRole('button', { name: 'Share Report' })
      .boundingBox())!
    const settings = (await app
      .getByRole('button', { name: 'Mileage Settings' })
      .boundingBox())!
    expect(share.x + share.width).toBeLessThanOrEqual(settings.x + 0.5)
    // The period tabs sit below the header, not over the title.
    const day = (await app
      .getByText('Day', { exact: true })
      .first()
      .boundingBox())!
    expect(day.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
  })
})
