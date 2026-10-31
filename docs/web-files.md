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
- **Contact photos** are `data:image/jpeg` URLs held in the contact record. They
  persist with the stores (IndexedDB) and render in `Avatar`, which on the web
  only accepts `data:`, `blob:` and `http(s):`.
- **Note photos** are Blobs in [`webPhotoStore.ts`](../src/lib/files/webPhotoStore.ts),
  in memory for this page load only.
- **Limited-photo-library UI** is hidden on the web; there is no such state.

### Seam for Cloud Sync photos (W4 / ADR 0040)

Photo sync needs the bytes to persist and to arrive from the server. The web
stand-ins are `webPhotoStore` (note photos) and the avatar `data:` URL. A photo
added on the web is not yet uploaded, and one downloaded on the web has nowhere
to live after the tab closes until `putWebPhoto` is called by the photo pass and
the store is backed by IndexedDB.

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
