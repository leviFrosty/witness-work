import type { Frame, Page } from '@playwright/test'
import { contentHash } from '../../src/lib/contentHash'
import { expect, readStoreRow, strings, test } from './fixtures'

/**
 * A note that ends with a phone's photo, opened in the note editor on the web.
 * The page doesn't hold the photo (no photo sync, docs/web-files.md), but the
 * note does, and editing the text around it must not lose it.
 */

const en = strings('en-US')

const CONTACT = 'a1b2c3d4-0000-4000-8000-000000000001'
const VISIT = 'b1b2c3d4-0000-4000-8000-000000000002'
const PHOTO = 'phone-photo-0001'
const NOTE = 'Talked about the garden'

const contact = {
  id: CONTACT,
  createdAt: '2026-10-01T10:00:00.000Z',
  name: 'Daniel Okafor',
  address: { line1: '', line2: '', city: '', state: '', zip: '', country: '' },
  email: '',
  phone: '',
  phoneRegionCode: 'US',
  customFields: {},
  updatedAt: 1793403316101,
}

const visit = {
  id: VISIT,
  contact: { id: CONTACT },
  date: '2026-10-02T10:00:00.000Z',
  note: NOTE,
  noteDoc: {
    v: 1,
    textHash: contentHash(NOTE),
    doc: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: NOTE }] },
        { type: 'image', attrs: { id: PHOTO, width: 400, height: 300 } },
      ],
    },
  },
  updatedAt: 1793403316101,
}

type Node = { type?: string; attrs?: { id?: string }; content?: Node[] }

const storedVisit = async (page: Page) => {
  const row = (await readStoreRow(
    page,
    'mmkv.default',
    'conversations'
  )) as string
  return JSON.parse(row).state.conversations.find(
    (conversation: { id: string }) => conversation.id === VISIT
  )
}

const storedImages = (doc: Node): string[] => {
  const ids: string[] = []
  const walk = (node: Node) => {
    if (node.type === 'image') ids.push(String(node.attrs?.id))
    node.content?.forEach(walk)
  }
  walk(doc)
  return ids
}

/** The editor runs in the page on the web; `Frame` is the page's main frame. */
async function openNoteEditor(page: Page): Promise<Frame> {
  await page.getByRole('button', { name: 'Contacts', exact: true }).click()
  await page.getByText('Daniel Okafor').first().click()
  await page
    .getByText('Done', { exact: true })
    .click({ timeout: 8000 })
    .catch(() => undefined)
  await page.getByText(NOTE).first().click()
  await expect(page.getByText('You talked with')).toBeVisible()
  await page.getByRole('button', { name: en.edit }).last().click()
  await page.getByText(NOTE).last().click()
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible()
  return page.mainFrame()
}

test.describe('the note editor with a photo the page does not hold', () => {
  test.use({
    seed: { contacts: [contact], conversations: [visit] },
    // Seeded records earn badges, whose welcome would cover the page.
    preferences: { badgesWelcome: 'done' },
  })

  test('it shows the missing-photo placeholder, not a blank box', async ({
    app,
    shot,
  }) => {
    await openNoteEditor(app)
    const frame = app.locator('.note-image').first()
    await expect(frame).toBeVisible()
    await expect(frame).toContainText(en.richText_photoMissing)
    await shot('note-editor-missing-photo')
  })

  test('opening it selects no photo, and typing keeps the photo', async ({
    app,
    shot,
  }) => {
    const errors: string[] = []
    app.on('pageerror', (error) => errors.push(error.message))
    await openNoteEditor(app)
    await app.waitForTimeout(1000)
    await expect(app.locator('.ProseMirror-selectednode')).toHaveCount(0)
    await app.keyboard.type('Q')
    await expect(app.locator('.ProseMirror')).toContainText('Q')
    await expect(app.locator('.note-image')).toHaveCount(1)
    await shot('note-editor-typed-after-photo')
    await app.getByTestId('note-editor-done').click()
    await app.waitForTimeout(800)
    await app.getByRole('button', { name: en.save }).last().click()
    await expect.poll(async () => (await storedVisit(app)).note).toContain('Q')
    expect(storedImages((await storedVisit(app)).noteDoc.doc)).toEqual([PHOTO])
    expect(errors.filter((message) => /mismatched/.test(message))).toEqual([])
  })
})
