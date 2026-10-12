---
status: accepted
---

# Rich notes keep a plain-text copy, and the editor is Tiptap in a WebView

## Context

Notes on visits, time entries, Day Plans, Recurring Plans (and their per-date overrides) and trips were plain strings. They gain formatting (headings, bold, italic, underline, strikethrough, lists, checklists, links) and photos.

Plain-text notes are in production in every user's iCloud and Google Drive sync files, backup files and contact shares, so a breaking change reaches anyone still running an older version on another device:

- the sync schema types every `note` as a string, and one invalid field rejects a device's whole file, so an older device would stop receiving anything (contacts, visits, plans) from an updated one;
- backup restore has no version check, and an older version restoring a newer backup would crash rendering a note;
- older recipients reject a contact share whose note isn't a string.

Older versions do keep fields they don't recognize, on records in sync files and backups.

## Decision

1. **Two fields.** `note` stays a plain-text string, always written: list items become `•`, `1.` or `☐`/`☑` lines, labeled links keep their address, photos are left out. The formatted doc goes in a new optional `noteDoc` (`{ v: 1, doc, textHash }`), written only when the note has something plain text can't hold. Search, exports, reminders, Buddies alerts and older versions keep reading `note`. See `src/lib/richText/notes.ts`.
2. **The plain text wins when they disagree.** `textHash` is the hash of the `note` it was saved with. An older version that edits a note changes `note` and either leaves `noteDoc` stale or drops it; the mismatch shows it, and readers use the plain text. Nothing is migrated in bulk and no `updatedAt` changes: plain notes become docs as they're read and are saved as docs only when edited.
3. **One allowlist for docs.** Every doc that comes in (sync, backup, share, the editor) is parsed by `parseRichTextDoc`: unknown nodes from a newer version become paragraphs that keep their words, unsafe link schemes and unknown marks are dropped, and size and nesting are capped. A doc that doesn't parse is dropped from its record, never the file. Its output reads back unchanged, so syncing it doesn't churn.
4. **Tiptap 3 in an Expo DOM component, a native toolbar, native rendering.** The editor is Tiptap in a full-screen screen, on `react-native-webview` (Expo's own WebView can't raise the keyboard when the editor focuses itself on iOS). Its toolbar is React Native, pinned to the keyboard with `react-native-keyboard-controller`, so iOS and Android get the same tools. The controller is enabled only while an editor is open, so the rest of the app's keyboard handling is unchanged. Notes are drawn natively everywhere else (no WebView in lists). We rejected 10tap (no code changes since 2025-11, a prebuilt Tiptap with published advisories, a toolbar that can't pin buttons) and a native editor (no ProseMirror-compatible data model).
5. **Photos are files referenced by id.** Photos are resized JPEGs in `Documents/note-images/<id>.jpg`; the doc stores the id and size, never a path, and once the photo is resized its share of the note's width (`scale`, 0.25 to 1), so it keeps its proportion on any screen. They sync behind the existing Include photos setting under their own `witness-work-note-*.jpg` names, which builds from before note photos ignore, so their cleanup can't delete them. A photo uploads once (photos never change) and downloads when a note refers to it. Cleanup deletes unreferenced photos after a day, locally and in the cloud (after a complete pull only). Backups and contact shares leave photos out.

## Consequences

- A device on an older version shows notes as plain text, and editing one there drops its formatting everywhere.
- Records carry the note twice when it's formatted; formatted notes are a small share of notes.
- Restoring a backup file doesn't restore note photos.
- The editor needs a native build (keyboard controller, WebView) and depends on an Expo patch for DOM components after an over-the-air update (expo/expo#50465). On Android it uses Expo's DOM WebView, patched to raise the keyboard when the editor focuses itself and to keep the back gesture off a selected photo's resize handles at the screen's edges (`patches/@expo__dom-webview@57.0.1.patch`, built from source).
