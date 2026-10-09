# Rich notes

Notes on visits, time entries, plans and trips open in a full-screen note editor. A formatting bar rides on the keyboard: bold, italic, underline, strikethrough, Heading and Subheading, bulleted, numbered and checklist lists with indent and outdent, links, photos, and undo/redo. The tools scroll sideways on narrow screens while the hide-keyboard button stays pinned on the right. Notes then read back formatted wherever they're shown, with link cards for their links, tappable checklists and full-screen photos.

## Sub-features

- `notes-editor` opens from every note field: Add Time and the Plan form (`time-entry-note-row`, `plan-note-row`), the visit form's Note box (`visit-note`) and the trip form (`trip-note`). Done (`note-editor-done`) closes it; Android Back does too. The form keeps the note until it's saved.
- `notes-toolbar` formats at the cursor. Buttons have testIDs `note-editor-<tool>` (`bold`, `italic`, `underline`, `strike`, `heading1`, `heading2`, `bulletList`, `orderedList`, `taskList`, `outdent`, `indent`, `link`, `photo`, `undo`, `redo`, `dismiss`).
- `notes-links` turns typed `https://…` and `www.…` addresses into links; the link button opens a sheet for an address (and text when nothing is selected). Read-only notes show a preview card for up to three links.
- `notes-photos` adds photos from the camera or library (up to 10, resized), shown in notes and full screen when tapped. Visit notes offer no photo button in data protection mode.
- `notes-photo-size` resizes a photo: tapping it in the editor shows a handle at each corner, and dragging one resizes the photo around its center, keeping its proportions (snapping near ¼, ½, ¾ and full). The image's `scale` (0.25 to 1) is its share of the note's width, so it shows at the same proportion on every screen. Photos never resized have no `scale`: full width when landscape, up to 360 pt tall when portrait.
- `notes-checklists` tick from the note where it's shown: Plan Details (Day Plans), an expanded visit card, a time entry in the day sheet, and trip details.
- `notes-sync` keeps plain text in `note` and the formatting in `noteDoc`; photos sync only with Include photos on.

## How to get to it (user POV)

- Add Time → Note. Plan a day → Note. A contact → Add (conversation) → Note. Mileage → add a trip → Note.
- Read back: the Schedule day sheet (time entries), Plan Details and plan rows, a contact's Conversation History (Show more), trip rows and trip details.

## Driving it with ww-verify

Preconditions: `wwv seed pioneer`, iOS or Android.

Steps:

- **Open.** Run `wwv link 'witnesswork://add-time'`, then `wwv ad press 'label="Note"'`. The route is `NoteEditor` (`wwv eval '__WW_DEV__.state().route.name'`) and the keyboard is up with the cursor in the note.
- **Type and format.** `wwv ad type "…"` types into the note. Press toolbar buttons by coordinates (see Gotchas); `wwv ad type $'\n'` starts a new line. Swipe the bar sideways (`wwv ad swipe <x1> <y> <x2> <y>`) to reach the list, link, photo and undo tools.
- **Photo.** Press the photo button, then "Choose Photos" in the menu; the system picker's photos are pressable by coordinates, then its ✓.
- **Resize.** Press the photo (it gets an outline and four corner handles), then drag a corner with `wwv ad gesture pan <x> <y> <dx> 0 600` from the handle's center (a right corner inward shrinks it). Read the image's `scale` back from `noteDoc` after saving; a photo at 0.5 is half the note's width wherever the note is shown, including on an iPad and in a buddy's copy of a shared Plan.
- **Close and save.** Press `note-editor-done`, set a duration, Submit.
- **Read back.** `wwv eval 'JSON.stringify(Object.values(__WW_DEV__.stores.serviceReports.getState().serviceReports).flatMap(m=>Object.values(m).flat()).filter(e=>e.noteDoc).map(e=>({note:e.note,blocks:e.noteDoc.doc.content.map(b=>b.type)})))'`. `note` is the plain text (list items as `•`, `1.`, `☐`/`☑`); `noteDoc` holds the blocks. Visits are in `__WW_DEV__.stores.conversations`.
- **Second view.** Schedule → today's day sheet shows the formatted note with its link card; tick a checklist item and read the store again (`checked: true`, and `☑` in `note`).
- **Proof.** `wwv shot <label>` after each step and `wwv errors`.
- **Scripted.** `wwv flow e2e/maestro/add-time.yaml` and `e2e/maestro/create-plan.yaml` type a plain note through the editor.

## Gotchas

- While the editor (a WebView) has the keyboard, iOS accessibility snapshots often fall back to a sparse tree that only lists the keyboard, so `label=` presses fail. Use coordinates from `wwv shot`, scaled by the screenshot's pixels per point. Calibrate the scale from a press the harness reports (it prints the point it tapped) rather than assuming the device size.
- The bar sits directly above the keyboard's suggestion strip; a press a few points low lands on a suggestion or key and inserts text instead of formatting.
- Don't deep-link a form while an editor is open: the new form stacks on top of it, and the old editor is still underneath when you go back.
- On Android, agent-device brings the app back to the front whenever another app is on top, which cancels the system photo picker. After pressing "Choose Photos", drive the picker with `adb -s <serial> shell input tap <x> <y>` (device pixels from `adb exec-out screencap -p`): tap the photo, then the picker's Done. Put a photo in the emulator's gallery first with `adb push <jpg> /sdcard/Pictures/` and `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/<jpg>`.
- Android's back gesture starts within about 30 dp of either screen edge, where a full-width photo's side handles sit. The editor reports the selected photo's handles and the web view excludes them from the gesture; a resize drag that starts on a handle there must resize, not close the editor. Drive it with `adb shell input swipe <x1> <y> <x2> <y> 900` from the handle's center.
- Dev builds load the editor page from Metro, so it uses system fonts and photos are sent to it scaled down; release builds use Inter and the photo files.
