import type { Page } from '@playwright/test'
import { expect, readStoreRow, strings, test } from './fixtures'
import {
  addContactAnswer,
  LIMITED_USAGE,
  mockScribeApi,
  textAnswer,
} from './scribeApi'

const en = strings('en-US')
const TERMS_ACCEPTED = {
  'scribe-consent': { termsAcceptedAt: 1_700_000_000_000, privacySeenAt: 1 },
}

test.use({
  serviceWorkers: 'block',
  signedIn: true,
  storeState: TERMS_ACCEPTED,
})

const VOICE_OR_PHOTO =
  /voice|speak|microphone|\bmic\b|photo|paper|camera|scan|siri/i

async function openConversation(page: Page) {
  await page.getByRole('button', { name: en.quickAction }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: en.scribe_orbLabelWeb })
    .click()
  await expect(page.getByRole('button', { name: en.scribe_send })).toBeVisible()
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: en.settings, exact: true }).click()
}

const composer = (page: Page) =>
  page.getByRole('textbox', { name: en.scribe_composerPlaceholder })

async function sendMessage(page: Page, text: string) {
  const send = page.getByRole('button', { name: en.scribe_send })
  await expect(async () => {
    await composer(page).click()
    await composer(page).fill('')
    await composer(page).pressSequentially(text)
    await expect(send).toBeEnabled({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await send.click()
}

test.describe('voice and photos are hidden', () => {
  test('the "+" sheet offers typing, with no microphone', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context)
    await app.getByRole('button', { name: en.quickAction }).click()
    const sheet = app.getByRole('dialog')
    await expect(
      sheet.getByRole('button', { name: en.scribe_orbLabelWeb })
    ).toBeVisible()
    await expect(sheet.getByText(en.scribe_speakAnUpdateWeb)).toBeVisible()
    await expect(
      sheet.getByText(en.scribe_speakAnUpdateSubtitleWeb)
    ).toBeVisible()
    await expect(sheet.getByText(en.scribe_speakAnUpdate)).toHaveCount(0)
    await expect(sheet.getByText(en.scribe_speakAnUpdateSubtitle)).toHaveCount(
      0
    )
    expect(await sheet.innerText()).not.toMatch(VOICE_OR_PHOTO)
    await shot('scribe-plus-sheet')
  })

  test('the conversation has no microphone, camera or paper button', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context)
    await openConversation(app)
    await expect(composer(app)).toBeVisible()
    await expect(composer(app)).toBeFocused()
    for (const name of [
      en.scribe_speak,
      en.scribe_captureMenu,
      en.scribe_readPaper,
      en.scribe_scanNotes,
      en.scribe_sayAChange,
    ])
      await expect(app.getByRole('button', { name })).toHaveCount(0)

    const send = await app
      .getByRole('button', { name: en.scribe_send })
      .boundingBox()
    const box = await composer(app).boundingBox()
    expect(send!.x + send!.width).toBeGreaterThan(box!.x + box!.width - 40)
    await expect(app.getByText(en.scribe_emptyTitle)).toBeVisible()
    await shot('scribe-conversation')
  })

  test('Scribe AI usage does not mention paper pages', async ({
    app,
    context,
  }) => {
    await mockScribeApi(context)
    await openSettings(app)
    await app.getByText(en.scribe_usageRow, { exact: true }).click()
    await expect(app.getByText(en.scribe_usagePlanFree)).toBeVisible()
    await app.getByRole('button', { name: en.scribe_usageInfoTitle }).click()
    await expect(app.getByText(en.scribe_usageInfoBodyWeb)).toBeVisible()
    await expect(app.getByText(/paper pages/i)).toHaveCount(0)
  })

  test('"From paper" is not offered when importing', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context)
    await openSettings(app)
    await app.getByText(en.importData, { exact: true }).click()
    await expect(
      app.getByText(en.onboardingPickUp_notes, { exact: true })
    ).toBeVisible()
    await expect(app.getByText(en.onboardingPickUp_paper)).toHaveCount(0)
    await expect(app.getByText(en.onboardingPickUp_paperDesc)).toHaveCount(0)
    await shot('scribe-import-options')
  })
})

test.describe('terms', () => {
  test.use({ storeState: {} })

  test('the Terms sheet keeps its next stop out of the address', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context)
    await app.getByRole('button', { name: en.quickAction }).click()
    await app
      .getByRole('dialog')
      .getByRole('button', { name: en.scribe_orbLabelWeb })
      .click()
    await expect(app.getByText(en.scribe_termsTitle)).toBeVisible()
    expect(app.url()).not.toContain('object')
    expect(new URL(app.url()).pathname).toBe('/ScribeConsent')
    expect(new URL(app.url()).search).toBe('?mode=open')
    await shot('scribe-terms')

    await app.getByRole('button', { name: en.scribe_termsAgree }).click()

    await expect(app.getByText(en.scribe_zdrIntroWeb)).toBeVisible()
    await expect(app.getByText(en.scribe_zdrOnDeviceBodyWeb)).toBeVisible()
    await expect(app.getByText(en.scribe_zdrIntro)).toHaveCount(0)
    await expect(app.getByText(en.scribe_zdrOnDeviceBody)).toHaveCount(0)
    await shot('scribe-privacy')
    await app.getByRole('button', { name: en.scribe_consentContinue }).click()
    await expect(
      app.getByRole('button', { name: en.scribe_send })
    ).toBeVisible()
    expect(new URL(app.url()).pathname).toBe('/ScribeConversation')
  })

  test('reloading on the sheet closes it after Agree instead of failing', async ({
    app,
    context,
  }) => {
    await mockScribeApi(context)
    await app.goto('/ScribeConsent?mode=open')
    await app.getByRole('button', { name: en.scribe_termsAgree }).click()
    await app.getByRole('button', { name: en.scribe_consentContinue }).click()
    await expect(
      app.getByRole('button', { name: en.quickAction })
    ).toBeVisible()
  })
})

test.describe('chat', () => {
  test('streams an answer and applies a proposed contact to local data', async ({
    app,
    context,
    shot,
  }) => {
    const received = await mockScribeApi(context, {
      steps: [addContactAnswer('Maria Santos')],
    })
    await openConversation(app)
    await sendMessage(app, 'Add Maria Santos as a new contact')
    await expect(app.getByText('Check it, then tap Add.')).toBeVisible()
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({
      protocol: 1,
      step: 0,
      app: { platform: 'web' },
    })
    await expect(
      app.getByRole('checkbox', { name: /Maria Santos/ })
    ).toBeVisible()

    await expect(
      app.getByRole('button', { name: en.scribe_sayAChange })
    ).toHaveCount(0)
    await shot('scribe-proposal')
    await app.getByRole('button', { name: /^Add 1$/ }).click()
    await expect
      .poll(async () =>
        JSON.stringify(await readStoreRow(app, 'mmkv.default', 'contacts'))
      )
      .toContain('Maria Santos')
    await shot('scribe-added')
  })

  test('a 401 refreshes the session once and goes on', async ({
    app,
    context,
  }) => {
    const received = await mockScribeApi(context, {
      steps: [
        { status: 401, code: 'unauthorized' },
        textAnswer('Done. ', 'Nothing to add.'),
      ],
    })
    await openConversation(app)
    await sendMessage(app, 'Hello')
    await expect(app.getByText('Done. Nothing to add.')).toBeVisible()
    expect(received.length).toBeGreaterThanOrEqual(2)
  })
})

test.describe('errors', () => {
  const send = async (page: Page, text = 'Hello') => {
    await openConversation(page)
    await sendMessage(page, text)
  }

  test('a server error says so and offers Try again', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context, {
      steps: [{ status: 500, code: 'server_error' }, textAnswer('Back again.')],
    })
    await send(app)
    await expect(app.getByText(en.scribe_errorUnavailable)).toBeVisible()
    await shot('scribe-error-server')
    await app.getByRole('button', { name: en.scribe_tryAgain }).click()
    await expect(app.getByText('Back again.')).toBeVisible()
  })

  test('a busy service says so', async ({ app, context }) => {
    await mockScribeApi(context, {
      steps: [{ status: 429, code: 'rate_limited', retryAfter: 30 }],
    })
    await send(app)
    await expect(app.getByText(en.scribe_errorBusy)).toBeVisible()
  })

  test('426 shows Update Required with a reload, not an app store update', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context, {
      steps: [{ status: 426, code: 'upgrade_required' }],
    })
    await send(app)
    await expect(
      app.getByRole('heading', { name: en.updateRequired_title })
    ).toBeVisible()
    await expect(app.getByText(en.updateRequired_bodyWeb)).toBeVisible()
    await expect(
      app.getByRole('button', { name: en.updateRequired_actionWeb })
    ).toBeVisible()
    await shot('scribe-error-update')
  })

  test('a used-up allowance shows the limit and the Supporter option', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context, {
      steps: [
        {
          status: 402,
          code: 'limit_reached',
          retryAfter: 10_800,
          body: { usage: LIMITED_USAGE },
        },
      ],
    })
    await send(app)
    await expect(
      app.getByRole('heading', { name: en.scribe_limitTitle })
    ).toBeVisible()
    await expect(app.getByText(en.scribe_limitUpsell)).toBeVisible()
    await expect(
      app.getByRole('button', { name: en.scribe_becomeSupporter })
    ).toBeVisible()
    await shot('scribe-error-limit')
  })

  test('a suspended account is told Scribe AI is not available', async ({
    app,
    context,
  }) => {
    await mockScribeApi(context, {
      steps: [{ status: 403, code: 'suspended' }],
    })
    await send(app)
    await expect(
      app.getByText(en.scribe_blockedSuspended).first()
    ).toBeVisible()
  })

  test('offline, Scribe AI explains itself and the page banner does not cover it', async ({
    app,
    context,
    shot,
  }) => {
    await mockScribeApi(context)
    await openConversation(app)
    await context.setOffline(true)
    await app.evaluate(() => window.dispatchEvent(new Event('offline')))
    const banner = app.getByText(en.webOffline_banner, { exact: false })
    await expect(banner).toBeVisible()
    await expect(app.getByText(en.scribe_offlineBadge).first()).toBeVisible()

    const bannerBox = (await banner.boundingBox())!
    const sendBox = (await app
      .getByRole('button', { name: en.scribe_send })
      .boundingBox())!
    expect(sendBox.y).toBeGreaterThan(bannerBox.y + bannerBox.height)
    await shot('scribe-offline')
    await context.setOffline(false)
    await app.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(app.getByText(en.scribe_offlineBadge)).toHaveCount(0)
  })
})
