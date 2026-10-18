---
status: accepted
---

# Paper pages are read by ww-api's vision model, then reuse the text pipeline

## Context

Many publishers have years of paper notes: notebooks, house-to-house records, and record sheets. ADR 0018 added a Photo Import that reads pages on the device. It works only on iPhone and iPad, takes five photos, and on-device recognition reads handwriting poorly in many of the app's languages. Android has no on-device handwriting recognizer good enough to replace it. Moving a backlog over means many pages of mostly handwriting, on both platforms, in every language.

The text pipeline stays as it is: App Attest or Play Integrity on each request (ADR 0007, ADR 0017), a Western zero-data-retention model host (ADR 0008), a client-only ledger (ADR 0009), and credits metered by content hash (ADR 0012).

## Decision

**Import from Paper sends chosen page photos to ww-api, which reads each one into plain text with a vision model on the same zero-data-retention allowlist. The text lands in the composer for the user to edit, then goes through the unchanged text pipeline.** This reverses ADR 0018's "no image is uploaded" for chosen photos only. Voice logs and document-camera scans stay on the device.

- **Entry points.** Onboarding's Pick up where you left off adds From paper, which opens the photo picker right away and then the Notes Import composer. In the composer, the camera button's Choose Photos uses the same path, on Android too. Both appear only when `GET /notes-import/status` advertises `capabilities.transcribe` (`maxPages`, 10).
- **On the device.** Pages are picked in tap order, re-encoded as JPEG with a long edge of at most 2000 px (which also drops EXIF, including location), and sent three at a time. The picker's copies are deleted once read; originals stay in the library. Page texts join in order with blank lines.
- **ww-api.** `POST /notes-import/transcribe` takes one base64 page. It checks size, type, and magic bytes, then verifies App Attest v2 or Play Integrity under a new purpose, `notes-import-transcribe`. The content hash is the SHA-256 of the base64 string; the request hash covers `{ imageHash, mimeType }`. The model call is pinned to the ZDR provider allowlist with reasoning off, and it returns `{ text, truncated, pagesRemaining }`. The image is never stored or logged; only routing and token counts are.
- **Metering.** Reading pages spends no Import Credit; sending the reviewed text is one ordinary import. Two limits keep the free model call bounded: a free user with no imports left is refused before any page is read (the same `limit_reached`), and each identity gets a rolling daily page allowance (40, or 200 for Supporters; 429 `transcribe_limit` past it).
- **Failures.** A failure every page would repeat (allowance, verification, connection, outage) stops the batch, and whatever was read is kept. A failed or truncated page keeps the rest and tells the user to check the text.

Since ADR 0027, `transcribe` is a bearer request on the account session: no per-page attestation or hashes, and the page allowance counts per account. A suspended account is refused (`suspended`), which stops the batch.

## Considered options

- **Keep it on the device and add ML Kit on Android.** Rejected: ML Kit's text recognizer is built for print, and handwriting is the point.
- **Send images straight into the import model, with no review step.** Rejected: the user couldn't fix misreads before records are proposed, refinement and history would have to carry images, and credits couldn't stay keyed to text.
- **Charge an Import Credit per page.** Rejected: one notebook would use a month's free allowance. The daily page limit bounds cost without that.
- **Server-side scans from the document camera.** Deferred: the native scanner returns recognized text, not images. Scans stay on the device until the module can hand over page images.

## Consequences

- Privacy copy, the Help sheet, and the FAQ now say that chosen photos are read by Scribe AI's zero-data-retention providers and aren't stored, while voice and scans stay on the device.
- The vision model is set with `NOTES_IMPORT_TRANSCRIBE_MODEL` (default: the import model). Whichever model is used must accept images on the allowlisted hosts under the same ZDR terms, checked before it ships.
- The status capability lets older workers keep the option hidden, and the transcribe endpoint must reach ww-api `main` before the app half ships.
- Recognition quality depends on the model, not the device, so it's the same on both platforms; the editable draft is still the safeguard.
