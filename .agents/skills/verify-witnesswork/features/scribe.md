# Scribe AI

Users tell Scribe AI what they did or plan to do, by voice or by typing. It reads their records on the device, then shows the changes it would make as review cards. Nothing is written until the User taps Add, and an Add can be undone from the conversation, the Added toast, or History. Usage is shown as a percentage of each usage window.

## Sub-features

- `scribe-consent`: once a device, the first entry shows "Before you start" (data stays private, AI can make mistakes, links to the Terms of Use and Privacy Policy, and "Agree"), then Zero Data Retention, then goes where the entry was going. There's no decline: swiping the sheet away leaves Scribe AI on and asks again next time. Only the Settings switch turns it off; turning it on before agreeing on this device opens "Before you start" first (swiping that away leaves it off). Offline entries only explain, without asking.
- `scribe-entry` opens Scribe AI from the Home orb ("Speak an update with Scribe AI"), the center "Quick Action" menu ("Speak an update"), the iPad menu bar (File → Speak an update), and onboarding's "Pick up where you left off" step. With on-device speech it starts listening; without it, it opens the conversation with the keyboard. Offline, the orb shows the no-internet badge and tapping it explains.
- `scribe-voice` listens on the device; the orb follows the voice and there's no live transcript. "Done" sends what was heard, "Discard" drops it (asking first after 15 s), and "Type instead" (the keyboard at the sheet's top left while listening, or the button under a message) opens the conversation with the keyboard, what was heard already in the composer. A call or leaving the app stops listening the same way: the text waits in the composer, unsent. Opened from a conversation (its microphone, Say a change), the sheet returns to that conversation.
- `scribe-conversation` sends typed text ("Tell Scribe AI what you did or plan to do", then "Send"). While the model works, the conversation shows activity rows ("Looking at your plans…") and streamed text.
- `scribe-review` shows a turn's write calls as cards under "Here's what I got": time, plans, contacts, visits and follow-ups, each with `from "<phrase>"` when the User said a relative date. A card can be unchecked; a card with "Which <name>?" needs a choice before "Add <n>" enables. "Say a change" (or a new message) replaces the Proposal.
- `scribe-apply-undo` writes the selected cards on "Add <n>", which shows "Added <n>" with "Undo" in the conversation and in a toast. Undo removes what was added, except records changed since.
- `scribe-usage` shows the fullest window as a ring in the conversation header ("Scribe AI usage, <n>% used"), which opens Settings → Scribe AI usage. A full window shows the limit card with its reset time, plus the Supporter upsell on the free plan.
- `scribe-history` lists conversations (History, in the conversation header), with delete, and Notes Imports from before Scribe AI under Earlier imports, which can still be undone.
- `scribe-paper` reads photos of paper pages into the composer through ww-api (camera button → "Read paper pages"; on iOS also "Scan notes" on the device), up to 10 pages per pick and a daily page limit. Pages left unread for a reason that can pass (offline, busy) stay in the composer's warning with "Try again" (reads only those pages) and "Skip unread pages".

## How to get to it (user POV)

- Home → the Scribe AI orb.
- The center "+" ("Quick Action") → "Speak an update".
- iPad: the menu bar's File menu → "Speak an update".
- Settings → Scribe AI usage (usage only).
- Onboarding → "Pick up where you left off" → paper pages.

## Driving it with ww-verify

Scribe AI calls ww-api, and the worker calls the model only with a real OpenRouter key. Judge the model's calls and replies without a device first: the eval in `src/features/scribe/evals` runs about 70 spoken-style scenarios through the app's real tools and turn loop against the worker (`src/features/scribe/tools/README.md` → Evals). Use a device to prove the UI. Pick one of two backends:

- **On-device fake** (default for UI work): no key, no model, deterministic. `wwv eval '__WW_DEV__.scribe.enableFake()'`, queue a canned turn with `wwv eval '__WW_DEV__.scribe.script("planAndLog")'`, then drive the UI or send with `__WW_DEV__.scribe.send("…")`. Scripts (`__WW_DEV__.scribe.scripts`): `answer`, `logTime`, `planAndLog`, `visitMaria`, `repair`, `tooMuch`, `refused`, `limit`, `modelError`, `dropConnection`, `contextFull`. `setFakeStatus({ enabled: false, reason: "disabled" })` and `setFakeUsage({ limited: true, … })` fake the server's switches and meter; `requests()` returns the step bodies the fake received. Tools → Scribe AI → "Answer from the fake" is the same switch. The fake lives in memory, so a relaunch (`wwv up`) turns it off; check with `wwv eval '__WW_DEV__.scribe.usingFake()'`.
- **Real backend and model** (for anything that depends on the model or ww-api's metering): run the backend branch with the real key from the user's ww-api `.dev.vars`, never printed:

  ```bash
  node ~/dev/ww-api-worktrees/scribe-api/scripts/verify/dev.mjs down   # only if it runs without the key and no other worktree uses it
  WW_API_DIR=~/dev/ww-api-worktrees/scribe-api WW_API_SECRETS_FROM=~/dev/ww-api/.dev.vars \
    node scripts/verify/ww-verify.mjs up --platform ios --seed pioneer
  curl -s "$(node ~/dev/ww-api-worktrees/scribe-api/scripts/verify/dev.mjs url)/scribe/v1/status"   # "enabled": true
  ```

  Drop `WW_API_DIR` once the backend is on ww-api `main`. Read `configured.OPENROUTER_API_KEY` in the worker's `.verify/state.json` (`true`, never the value). The bundle sends the worker's dev-bypass token, so the session opens without App Attest or Play Integrity, and every usage window's limit reads `-1` (unlimited): `percentUsed` stays 0, so read the meter from `units.used`. Request caps still apply. Each real turn costs about 5,000 units at medium reasoning with a cold cache (about $0.0005 at list price) on the user's OpenRouter account; keep runs short.

Preconditions:

- `wwv seed pioneer`. Scribe AI's flag is on by default; `wwv flag scribe-ai off` hides every entry point, and `wwv flag scribe-ai clear` restores it.
- A seed resets this device's consent, so the first entry opens the Terms of Use, then Zero Data Retention, before Scribe AI. To skip them, run `wwv eval '__WW_DEV__.scribe.acceptConsent()'`; `resetConsent()` asks again, and `consent()` reads `{ termsAcceptedAt, privacySeenAt }`.
- `wwv eval '__WW_DEV__.scribe.state()'` shows `status.enabled: true` and `gate` all false. `__WW_DEV__.scribe.availability()` is `{ status: "available" }`.

Steps (typing, iOS):

- **Open.** Run `wwv ad press 'label="Speak an update with Scribe AI"' --settle` (on a seeded `pioneer` Home the orb sits below the fold: `wwv ad scroll down`, then snapshot). With on-device speech the voice screen opens ("Use your microphone" the first time); press `label="Type instead"`. The simulator has no microphone input, so voice itself can't be proven there.
- **Send.** Fill the composer by its ref from `wwv ad snapshot -i` (its accessible name repeats the placeholder, so the `label=` selector misses): `wwv ad fill @eN "I did two hours of field service this morning and plan to go out Saturday at 9 for two hours" --settle`. `fill` can report `TEXT_INPUT_COMMIT_NOT_OBSERVED` although the text went in; check a screenshot before retrying, or the text doubles. Then `wwv ad press 'label="Send"' --settle`. Wait with `wwv ad wait text "Here’s what I got"` (curly apostrophe; the real model takes 5 to 20 s).
- **Review.** Expect a time card ("<2 hours> field service" in the User's time format, `from "this morning"`) and a plan card for Saturday at 9:00 AM (`from "Saturday at 9"`: the date and time phrases together), and "Add 2". Read the Proposal: `wwv eval '__WW_DEV__.scribe.latest()'` (its last item is the `proposal` with `cards[].effects[].preview`). Run `wwv shot scribe-review`.
- **Add.** Run `wwv ad press 'label="Add 2"' --settle`; expect "Added 2" and "Undo". Read back: `wwv eval '__WW_DEV__.scribe.state().undoable'` lists the Proposal id; the time entry is in `__WW_DEV__.stores.serviceReports.getState().serviceReports` (filter out `verify-` ids) and the plan in `.dayPlans` for that Saturday. Run `wwv shot scribe-added`.
- **Undo.** Press the conversation's `label="Undo"`; expect "Undone". Read back the same stores: both records are gone and `undoable` is empty.
- **Usage.** `wwv eval '__WW_DEV__.scribe.refresh()'`, then `wwv eval '__WW_DEV__.scribe.state().usage'` before and after a turn: `windows[0].units.used` goes up. The header ring opens Settings → Scribe AI usage.
- **History.** Press `label="History"` in the conversation header; the conversation is listed.
- **Without the UI.** `__WW_DEV__.scribe.send(text)` starts a turn (the conversation id lands in `__WW_DEV__.scribe.last`), `injectProposal()` gives a pending Proposal from the fake, and `add(id)`, `undo(id, "conversation")`, `dismiss(id)`, `toggle(id, cardId)`, `choose(id, cardId, choice)` and `agree(id, cardId, agreed)` (data protection mode's "agreed I may keep their details" switch) act on one. `conversation(id)` returns the transcript's structure and items, `contextSize()` the context and tool sizes a step sends, and `clear()` forgets the device's conversations, undo records and usage (records Scribe AI added stay). These are setup and read-backs, never the proof of a UI path.
- **Proof.** Run `wwv errors`.

## Gotchas

- Labels with an apostrophe use U+2019 (`Here’s what I got`), as in `en-US.json`.
- Android: the `ww-verify-N` emulators boot with `-no-audio`, so voice can't hear anything there; prove the keyboard path on Android and report voice as unverified. Every `wwv ad` command except a ref action (`press @eN`) reopens the app first, which pauses the activity, and a pause ends a recording as interrupted by design ("I didn’t catch that." when nothing was heard). `wwv shot` and `wwv eval` don't reopen it, so open the sheet, then capture the listening states with those only.
- No microphone audio on either platform: fake the level and the endings from `wwv eval` with the native module's own emitter, e.g. `globalThis.expo.modules.SpeechTranscription.emit("onLevel", { level: 0.8 })` (raw 0–1; send a few per second, about 0.2 for room tone) and `….emit("onEnd", { text: "…", reason: "interrupted" })` (ends a listening recording as a call would). `stop()` still returns the real, empty transcript, so Done shows "I didn’t catch that.". On-device recognition needs Android 12 or later with Google's on-device recognizer, and the first use may ask to download a language pack (about 60 MB). Where it's unavailable, every entry point opens the keyboard instead.
- iOS simulator: speech availability reports available, but starting fails (no SpeechAnalyzer model), so the sheet says "Speech recognition isn’t available…". To drive listening anyway, replace the module's functions from `wwv eval` (they're writable): `const m = globalThis.expo.modules.SpeechTranscription; m.start = async () => ({ locale: 'en-US', engine: 'dictationTranscriber' }); m.stop = async () => '<what was heard>'; m.cancel = async () => {}`. A relaunch restores the real ones.
- Paper pages through the picker need photos in the simulator's library (`xcrun simctl addmedia` is outside `wwv`; report it as unverified unless the brief allows it). To skip the picker, copy JPEGs into the app's `Library/Caches/ImagePicker` (iOS, `xcrun simctl get_app_container <udid> com.leviwilkerson.jwtimedev data`) or `cache/ImagePicker` (Android, `adb push` then `run-as … cp`), and open them as onboarding does: `wwv nav ScribeConversation '{"entry":"onboarding","paperPages":[{"uri":"file://…/page1.jpg","width":1200,"height":1600}]}'`. The fake reads each page as `fake.pageTexts` in order (`null` fails that page with `model_error`), then `fake.pageText`.
- Offline: `__WW_DEV__.network.offline(true)` makes the app read as offline whatever the device says; `offline(false)` comes back and runs the reconnect listeners (a turn that ended with `network` goes on by itself). The fake fails steps and page reads with `network` while offline. `script("dropConnection")` drops the connection during that step, and `fake.dropAfterPages = n` drops it after `n` more pages are read. On Android, `adb shell cmd connectivity airplane-mode enable|disable` is the real thing.
- A dev-bypass worker meters as free with unlimited windows, so it never shows the limit card from real usage by default. Prove the limit and upsell with the fake: `wwv eval '__WW_DEV__.scribe.enableFake(); __WW_DEV__.scribe.script("limit")'`, then send. To reach them through the real meter instead, keep real limits on the local worker (never a deployed one): `node <ww-api checkout>/scripts/verify/dev.mjs kv put scribe:dev-session '{"limits":"real"}'` (add `"plan":"supporter"` for the session and weekly windows) plus a small `scribe:limits` such as `'{"free":{"monthly":3000}}'`; KV is cached for up to 60 s. Delete both keys afterwards, since every worktree shares the worker.
- The real model's wording varies. Assert on the stores and the cards' kinds and dates, not on its reply text.
