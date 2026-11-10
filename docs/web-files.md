# Web files and photos

How WitnessWork on the web picks photos, downloads exports and reads imports
(ADR 0037 §1, §5, §8). The code is in [`src/lib/files/`](../src/lib/files/).
Nothing here uploads a file: the browser reads the bytes it picks and the app
works on them in the page.

## Picking

- **One input, made on demand.** [`pickFiles.ts`](../src/lib/files/pickFiles.ts)
  makes an `<input type="file">` for each pick, resolves on `change` or `cancel`
  (closing the chooser returns nothing, not an error), and removes it. The
  photo library and the camera pick through it (`pickWebImages`); other pickers
  use `expo-document-picker`, which opens the same native file chooser.
- **Phones get the camera.** `pickWebImages(options, 'camera')` sets `capture`.
  The rich text toolbar hides Take Photo where the device has no touch.
- **Picked files keep their `File`.** The asset has a `file`; a `file://` or
  `icloud://` URI never reaches an `<img>`. [`readPicked.ts`](../src/lib/files/readPicked.ts)
  reads text with `File.text()` on the web and `FileSystem` elsewhere.

## Photos

- **Downscaled in the browser** ([`webImages.ts`](../src/lib/files/webImages.ts)):
  decode with an `<img>`, draw into a canvas, `toBlob('image/jpeg')`. A contact
  photo is at most 1024 px on its long side (quality 0.85) and a note photo at
  most 2048 px (`NOTE_IMAGE_MAX_SIDE`). Images over 120 megapixels or 50 MiB and files that aren't
  images are refused with `photoPicker_unsupported` / `photoPicker_tooLarge`.
- **Note photos sync; avatars don't yet.** Two capabilities
  (`src/lib/platformCapabilities.ts`): `syncedNotePhotos` is on for the web,
  `syncedAvatarPhotos` is phones only. So a note's photo button shows on the
  web and the Cloud Sync photo pass runs there for note photos
  (`photosTravel()`), while the avatar picker's Choose Photo (contacts and
  profile) stays hidden and the avatar passes and avatar cleanup don't run
  (`avatarPhotosTravel()` in `iCloudSync.ts`).
- **Avatars from a phone show initials.** A contact or profile avatar whose
  value is an `icloud://` marker shows initials (`isRenderableImageValue`). The
  record keeps its reference and revision, so editing the contact on the web
  publishes the phone's photo reference unchanged, and the phones keep the
  photo.
- **Never a reference to nothing.** If an avatar's value is a `data:` or `blob:`
  URL (a photo only this page holds), the sync payload carries no photo for it
  (`sanitizeContactAvatar`, `sanitizeProfileAvatar`) rather than a reference
  no phone can fetch.
- **Limited-photo-library UI** is hidden on the web; there is no such state.

### Note photos in the browser

[`webPhotoStore.ts`](../src/lib/files/webPhotoStore.ts) is the web's
`note-images/` folder: the IndexedDB database `witnesswork-photos`, apart from
the stores (`docs/web-storage.md`).

- **Bytes and their facts apart.** `photos` holds each photo's bytes (an
  `ArrayBuffer`, keyed by the photo's id) and `meta` holds `{ savedAt, size,
type }`. Bytes, not a `Blob`: WebKit refuses a `Blob` in IndexedDB in a
  private or ephemeral session.
- **Listed at once, read when shown.** The first use reads `meta` only, so the
  page knows which photos it holds, their sizes and their times without loading
  any. A photo's bytes are read the first time something asks for it (a note on
  screen, the editor, the photo pass uploading it) and stay in memory for that
  page load behind one object URL.
- **While it loads,** a note shows an empty frame (`useNoteImagePending`), then
  the photo. A photo the browser doesn't hold shows "This photo isn't on this
  device." until the photo pass downloads it.
- **Saved as it's added.** `putWebPhoto` keeps the photo in memory and writes it
  in a transaction of its own. A write that fails (no room, a disk error) is
  told to the User once through `WebStorageNotices`, the same toasts as the
  stores; the photo stays for that page load and still uploads.
- **Without IndexedDB** (a private window that refuses it) photos live in memory
  for the page load, as the stores do.
- **The photo pass** reaches it through `webPhotoFiles`
  ([`photoFiles.ts`](../src/lib/syncTransport/server/photoFiles.ts)): a note
  photo's "path" on the web is `webphoto:<id>` (`noteImageFilePath`), and
  `webPhotoModifiedAt` answers what `FileSystem.getInfoAsync` answers on a
  phone. Uploads, downloads, deletes of replaced photos, and the unused-photo
  sweep (`useNoteImageCleanup`) then run as on a phone.
- **One tab writes,** as with the stores: a tab that isn't the active one, or
  that was taken over, stops writing photos (`stopWriting`).
- **A wipe takes them.** `clearAllWebData()` clears the photo database after
  the stores, so signing out, a revoked session and signing in as another
  account leave no photo behind.
- **Buddies' shared Plan photos** use the same store on the web
  (`sharedPhotoFiles.ts`).

### Pasting and dropping images into a note

The note editor takes image files on the web (`takesImageFiles` in the editor's
setup; phones are unchanged).

- **Paste and drop are one path.** `RichTextEditorDom` hands the files to its
  host as object URLs (`onImageFiles`), and `RichTextEditor` saves each one with
  `saveNoteImage`, as the photo button does, then inserts it at the cursor (a
  drop moves the cursor to where it landed first).
- **What counts as an image paste**
  ([`pastedImages.ts`](../src/components/richText/editor/pastedImages.ts)):
  every file on the clipboard is an image, and its HTML, if any, has no text.
  That takes a screenshot, an image copied from a page (the page's `<img>` and
  a copy of the image) and image files from a file manager (which add their
  names as plain text). Text copied from a spreadsheet or a document arrives
  with a picture of itself; that pastes as text.
- **The same limits as a picked photo:** at most 50 MiB and 120 megapixels,
  re-encoded as a JPEG at quality 0.8 and at most 2048 px on its long side,
  10 photos a note. Nothing is ever stored in the note but
  `{ id, width, height, scale }`.
- **Remote images are dropped, never fetched.** The note's schema parses only
  `img[data-note-image]` and ProseMirror parses pasted HTML in a document that
  loads nothing, so an `<img src="https://…">` in pasted content leaves no
  trace and makes no request. The web's `connect-src` wouldn't allow fetching
  it either.
- **Failures are toasts** (`toast.error`): a file the browser can't decode
  (`photoPicker_unsupported`), one too large (`photoPicker_tooLarge`), the
  eleventh photo (`richText_photoLimit`), and a note that can't hold photos,
  such as a visit note in data protection mode (`richText_photosNotAllowed`).
  A dropped file that isn't an image is refused the same way, and never opens
  in the tab.

### Seam for avatar photos

Avatars still use a `data:` URL on the web. To sync them: keep them in a store
like `webPhotoStore`, give them a path the avatar passes can read and write
(`imageSources.ts` works on `file://` paths in the documents folder), resolve
that path to an object URL where avatars render, and turn `syncedAvatarPhotos`
on for the web. The same capability lifts the guard in `avatarPayload.ts` that
sends a `data:` or `blob:` avatar as no photo.

## Exporting

[`exportFile`](../src/lib/files/exportFile.ts) is the one call for reports,
backups, CSV, contacts and pets: `prepareExport(file)` then `deliverExport`.

- **`purpose: 'save'`** (backups, CSV, reports) always downloads: a Blob behind a
  hidden `<a download>`.
- **`purpose: 'send'`** (a contact, a pet picture) uses `navigator.share({ files })`
  on touch devices when `canShare` accepts the file, and downloads otherwise or
  when the share is refused. Closing the share sheet downloads nothing.
- **Text shares** (`Share.share`) use `navigator.share` on touch devices and copy
  to the clipboard elsewhere, with the "Copied!" toast
  ([`src/vendor/web/share.ts`](../src/vendor/web/share.ts)).
- **File names** are made safe by [`fileNames.ts`](../src/lib/files/fileNames.ts)
  and each export names its own MIME type (`.witnesswork` is
  `application/witnesswork+json`).
- **No `expo-file-system` path call runs on the web.**
- **Backups are password-locked on the web.** The account-key lock needs key
  material the web doesn't have yet (W3).

## Importing

Backup, JSON, CSV and `.witnesswork` imports read the picked `File`.

### MyTime

`readMytimeDb.web.ts` reads a `.mytimedb` with [sql.js](https://github.com/sql-js/sql.js)
(`readMytimeSqlite.ts`) in memory, then hands the rows to the shared
`readMytimeTables.ts`.

- **Loaded on demand.** sql.js is its own chunk, fetched when an import starts.
- **Wasm from our origin.** `scripts/web.mjs` copies `sql-wasm-browser.wasm` into
  `public/` (git-ignored), and it is fetched from `/sql-wasm-browser.wasm`. The
  CSP's `connect-src 'self'` and `'wasm-unsafe-eval'` cover it. No
  `SharedArrayBuffer`, COOP/COEP or worker.
- **25 MiB cap**, checked before the bytes are read. The database opens
  `PRAGMA query_only`, and a file that isn't a MyTime database is refused before
  sql.js runs.
