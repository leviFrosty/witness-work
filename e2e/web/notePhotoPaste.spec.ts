import type { Page } from '@playwright/test'
import { contentHash } from '../../src/lib/contentHash'
import { expect, readStoreRow, strings, test } from './fixtures'
import { makePng } from './testFiles'

const en = strings('en-US')

const CONTACT = 'a1b2c3d4-0000-4000-8000-000000000001'
const VISIT = 'b1b2c3d4-0000-4000-8000-000000000002'
const NOTE = 'Talked about the garden'
const REMOTE = 'https://images.example.com/hill.png'

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
      content: [{ type: 'paragraph', content: [{ type: 'text', text: NOTE }] }],
    },
  },
  updatedAt: 1793403316101,
}

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
}

type Transfer = {
  files?: { name: string; type: string; base64: string }[]
  data?: Record<string, string>
}

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

const imagesIn = (doc: Node): Record<string, unknown>[] => {
  const found: Record<string, unknown>[] = []
  const walk = (node: Node) => {
    if (node.type === 'image') found.push(node.attrs ?? {})
    node.content?.forEach(walk)
  }
  walk(doc)
  return found
}

const savedPhotoIds = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const request = indexedDB.open('witnesswork-photos')
        request.onerror = () => resolve([])
        request.onsuccess = () => {
          const db = request.result
          if (!db.objectStoreNames.contains('photos')) {
            db.close()
            return resolve([])
          }
          const keys = db
            .transaction('photos')
            .objectStore('photos')
            .getAllKeys()
          keys.onsuccess = () => {
            db.close()
            resolve(keys.result.map(String))
          }
          keys.onerror = () => resolve([])
        }
      })
  )

async function openContact(page: Page) {
  await page.getByRole('button', { name: 'Contacts', exact: true }).click()
  await page.getByText('Daniel Okafor').first().click()
  await page
    .getByText('Done', { exact: true })
    .click({ timeout: 8000 })
    .catch(() => undefined)
}

async function openNoteEditor(page: Page) {
  await openContact(page)
  await page.getByTestId(`visit-card-${VISIT}`).first().click()
  await expect(
    page.getByRole('heading', { name: en.visitDetails_title })
  ).toBeVisible()
  await page.getByRole('button', { name: en.edit }).last().click()
  await page.getByText(NOTE).filter({ visible: true }).last().click()
  await expect(page.locator('.ProseMirror')).toBeVisible()
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('ControlOrMeta+End')
}

async function saveNote(page: Page) {
  await page.getByTestId('note-editor-done').click()
  await page.waitForTimeout(800)
  await page.getByRole('button', { name: en.save }).last().click()
}

const transfer = (page: Page, kind: 'paste' | 'drop', content: Transfer) =>
  page.evaluate(
    ([kind, content]) => {
      const data = new DataTransfer()
      for (const file of content.files ?? []) {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
        data.items.add(new File([bytes], file.name, { type: file.type }))
      }
      for (const [type, value] of Object.entries(content.data ?? {}))
        data.setData(type, value)
      const editor = document.querySelector('.ProseMirror')!
      if (kind === 'paste') {
        const event = new ClipboardEvent('paste', {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        })
        Object.defineProperty(event, 'clipboardData', { value: data })
        editor.dispatchEvent(event)
        return
      }
      const box = editor.getBoundingClientRect()
      const event = new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
        clientX: box.left + 40,
        clientY: box.top + 20,
      })
      Object.defineProperty(event, 'dataTransfer', { value: data })
      editor.dispatchEvent(event)
    },
    [kind, content] as const
  )

const png = async (name: string, width = 640, height = 400) => ({
  name,
  type: 'image/png',
  base64: (await makePng(width, height)).toString('base64'),
})

const shownPhotos = (page: Page) =>
  page.evaluate(
    () =>
      [
        ...document.querySelectorAll<HTMLImageElement>('.note-image img'),
      ].filter((img) => img.complete && img.naturalWidth > 0).length
  )

test.describe('pasting a photo into a note', () => {
  test.use({
    seed: { contacts: [contact], conversations: [visit] },
    preferences: { badgesWelcome: 'done' },
    signedIn: true,
  })

  test('a pasted screenshot joins the note and is still there after a reload', async ({
    app,
    shot,
  }) => {
    await openNoteEditor(app)
    await transfer(app, 'paste', {
      files: [await png('Screenshot.png', 3000, 1500)],
    })
    await expect.poll(() => shownPhotos(app)).toBe(1)
    await shot('note-editor-pasted-photo')
    await saveNote(app)

    await expect
      .poll(async () => imagesIn((await storedVisit(app)).noteDoc.doc).length)
      .toBe(1)
    const [image] = imagesIn((await storedVisit(app)).noteDoc.doc)
    expect(image).toMatchObject({ width: 2048, height: 1024 })
    expect(Object.keys(image!).sort()).toEqual(
      ['height', 'id', 'scale', 'width'].filter((key) => key in image!)
    )
    await expect.poll(() => savedPhotoIds(app)).toEqual([image!.id])

    await app.goto('/')
    await expect(
      app.getByRole('button', { name: en.quickAction })
    ).toBeVisible()
    await openContact(app)
    await app.getByText('Show more', { exact: true }).first().click()
    const photo = app.locator('img[src^="blob:"]').first()
    await expect(photo).toBeVisible()
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(2048)
    await expect(app.getByText(en.richText_photoMissing)).toHaveCount(0)
    await shot('visit-pasted-photo-after-reload')
  })

  test("an image copied from a page is stored as a photo, never linked to the page's address", async ({
    app,
  }) => {
    const requested: string[] = []
    app.on('request', (request) => requested.push(request.url()))
    await openNoteEditor(app)
    await transfer(app, 'paste', {
      files: [await png('image.png')],
      data: {
        'text/html': `<meta charset="utf-8"><img src="${REMOTE}" alt="A hill">`,
      },
    })
    await expect.poll(() => shownPhotos(app)).toBe(1)
    await saveNote(app)
    await expect
      .poll(async () => imagesIn((await storedVisit(app)).noteDoc.doc).length)
      .toBe(1)
    expect(JSON.stringify(await storedVisit(app))).not.toContain('example.com')
    expect(requested.filter((url) => url.includes('example.com'))).toEqual([])
  })

  test('formatted text from a page keeps its text and drops its remote images', async ({
    app,
  }) => {
    const requested: string[] = []
    app.on('request', (request) => requested.push(request.url()))
    await openNoteEditor(app)
    await transfer(app, 'paste', {
      data: {
        'text/html': `<p>He liked <b>the hill</b><img src="${REMOTE}"> best</p>`,
        'text/plain': 'He liked the hill best',
      },
    })
    await expect(app.locator('.ProseMirror')).toContainText(
      'He liked the hill best'
    )
    await expect(app.locator('.ProseMirror strong')).toHaveText('the hill')
    await expect(app.locator('.ProseMirror img')).toHaveCount(0)
    await saveNote(app)
    await expect
      .poll(async () => (await storedVisit(app)).note)
      .toContain('He liked the hill best')
    expect(imagesIn((await storedVisit(app)).noteDoc.doc)).toEqual([])
    expect(JSON.stringify(await storedVisit(app))).not.toContain('example.com')
    expect(requested.filter((url) => url.includes('example.com'))).toEqual([])
  })

  test('text copied with a picture of itself, as spreadsheets do, pastes as text', async ({
    app,
  }) => {
    await openNoteEditor(app)
    await transfer(app, 'paste', {
      files: [await png('image.png')],
      data: {
        'text/html': '<table><tr><td>Monday</td><td>3 hours</td></tr></table>',
        'text/plain': 'Monday\t3 hours',
      },
    })
    await expect(app.locator('.ProseMirror')).toContainText('Monday')
    await expect(app.locator('.note-image')).toHaveCount(0)
  })

  test('an image file dropped on the note joins it', async ({ app }) => {
    await openNoteEditor(app)
    await transfer(app, 'drop', { files: [await png('hill.png')] })
    await expect.poll(() => shownPhotos(app)).toBe(1)
    await saveNote(app)
    await expect
      .poll(async () => imagesIn((await storedVisit(app)).noteDoc.doc).length)
      .toBe(1)
  })

  test('a file the browser cannot open as an image says so', async ({
    app,
    shot,
  }) => {
    await openNoteEditor(app)
    await transfer(app, 'paste', {
      files: [
        {
          name: 'broken.png',
          type: 'image/png',
          base64: Buffer.from('not a picture').toString('base64'),
        },
      ],
    })
    await expect(app.getByText(en.photoPicker_unsupported)).toBeVisible()
    await expect(app.locator('.note-image')).toHaveCount(0)
    await shot('note-editor-paste-unsupported')

    await transfer(app, 'drop', {
      files: [
        {
          name: 'report.pdf',
          type: 'application/pdf',
          base64: Buffer.from('%PDF-1.4').toString('base64'),
        },
      ],
    })
    await expect(app.locator('.note-image')).toHaveCount(0)
    expect(new URL(app.url()).pathname).not.toContain('report')
  })

  test('a note stops at ten photos and says so', async ({ app }) => {
    await openNoteEditor(app)
    const file = await png('small.png', 40, 30)
    await transfer(app, 'paste', {
      files: Array.from({ length: 11 }, (_, index) => ({
        ...file,
        name: `small-${index}.png`,
      })),
    })
    await expect.poll(() => shownPhotos(app)).toBe(10)
    await expect(
      app.getByText(en.richText_photoLimit!.replace('%{count}', '10'))
    ).toBeVisible()
    await expect(app.locator('.note-image')).toHaveCount(10)
  })
})
