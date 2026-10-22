---
status: accepted
---

# Voice and photo input are transcribed on-device, then reuse the text pipeline

## Context

Publishers want two faster ways into Scribe AI (Notes Import): a **Voice Log** dictated right after a call ("Talked with Maria about Psalm 37, go back Thursday"), and a **Photo Import** of handwritten house-to-house notes or a record sheet. Both have to produce the same reviewable Contacts, Visits, and follow-ups as pasted notes.

The pipeline is text-shaped end to end. App Attest guards each request (ADR 0007), or Play Integrity on Android (ADR 0017). Ministry text goes only to a Western zero-data-retention model host (ADR 0008). The ledger is client-only (ADR 0009). Records are reconciled at Accept (ADR 0010). Import Credits are metered by content hash, with free Empty Imports (ADR 0012). Audio and images are more sensitive than the text derived from them: a voice is biometric, and a photo can show faces, door numbers, and other people's handwriting.

## Decision

**Turn voice and photos into text on the device. Show that text in the composer for the user to edit, then send it through the unchanged text pipeline.** No audio or image is uploaded or stored. The server sees an ordinary notes import, so attestation, credits, refinement, history, resume, and reconcile all apply with no backend change.

- **Voice** (`modules/speech-transcription`, a local Expo module): on iOS 26+ it uses SpeechAnalyzer with SpeechTranscriber, or DictationTranscriber on hardware without SpeechTranscriber. This needs only microphone access, and the OS downloads Apple's language model on first use. Before iOS 26 it uses SFSpeechRecognizer with `requiresOnDeviceRecognition`, offered only for locales whose on-device model is present. That path also needs speech recognition access. The app language is tried first, then the device languages. The mic is hidden when no on-device recognizer serves any of them with a model this hardware can run. If the analyzer still can't start (as on the simulator), the app says voice isn't available on this device and hides the mic. Audio is processed in memory, never written to disk, and the audio session is restored afterwards. The user's contact names bias recognition, and they stay on the device. Recording ends after 10 minutes, or when the app is backgrounded or interrupted, and keeps what was heard.
- **Photo** (`modules/text-recognition`, a local Expo module): uses Vision's accurate recognizer, which reads handwriting, and the VisionKit document camera. Scans are recognized in memory. Library photos come through the system picker, which needs no permission, and the picker's copies are deleted once read. Native code returns lines with boxes. `layoutRecognizedText` (JS, pure) rebuilds reading order, keeps a record-sheet row together with `|` column separators, and inserts paragraph breaks.
- **Review before send**: captured text is appended to the composer draft, where the user fixes misheard or misread words. Nothing is sent until they tap Send. Voice and photo start new imports only; refinements stay typed.
- **Metering and access**: every input type uses the same Import Credit allowance; there is no separate gate for voice or photo. The allowance is server-configured, and alongside this change the free tier drops from 5 to 3 imports per 30-day window.
- **Platform seam**: each module's `index.ts` is the platform-neutral contract. Android can implement the same `SpeechTranscription` and `TextRecognition` module names, for example with Android's on-device `SpeechRecognizer` and ML Kit text recognition and document scanner. Until then, `isSupported()` is false on Android and the entry points stay hidden. An implementation must report itself unavailable rather than fall back to server recognition.

## Considered options

- **Upload audio or images to a multimodal model.** Rejected. It sends biometric audio and photos of third parties to a third party. It is unclear whether the ZDR hosts in ADR 0008 accept multimodal input under the same terms. It needs new attested endpoints, size limits, and credit rules. And the user couldn't check the transcription before the model acted on it.
- **Third-party React Native packages** (e.g. `expo-speech-recognition`, ML Kit wrappers). Deferred. They would bring Android sooner, but they add dependencies with their own config plugins and permission defaults. Some also allow server recognition, so the privacy promise would rest on a flag. The local modules are small, enforce on-device only, follow the repo's existing `modules/` pattern, and keep a contract any later Android implementation can satisfy.
- **Rely on keyboard dictation and Live Text paste.** Still works and costs nothing. It isn't guaranteed to run on-device, it gives no record-then-review flow after a call, and it can't scan a multi-page record sheet in one step.
- **Supporter-only input types.** Rejected for now. Transcription has no server cost, and the credit allowance is already the upsell.

## Consequences

- The privacy copy can say plainly what leaves the device: only the text the user sends. The FAQ and the Notes Import data-handling note say so.
- Microphone, speech recognition, and camera usage strings now ship in Info.plist. The microphone is used only for voice logs, and Android's `RECORD_AUDIO` stays blocked.
- Recognition quality depends on the device: on-device speech accuracy varies by language, and messy handwriting misreads. The editable draft is the mitigation, and the model still flags anything uncertain.
- On-device speech can only be fully checked on a real device. Simulators and macOS can exercise SpeechAnalyzer with audio files, but not the full microphone path.

## Addendum (2026-10): Android

Scribe AI (ADR 0032) brings voice to Android through the same `modules/speech-transcription` contract, so `index.ts` and the JS that drives it are shared. Photo input is unchanged.

- **API**: Android 12+ (`SpeechRecognizer.createOnDeviceSpeechRecognizer`). The module only ever creates that recognizer: never `createSpeechRecognizer`, never Android's voice-input screen, and a network error fails the recording rather than retrying another recognizer. The system's on-device recognition service records and transcribes, so audio never reaches the app's process and nothing is written to disk. Contact names bias recognition through `EXTRA_BIASING_STRINGS` on Android 13+, best effort. The engine reports as `androidOnDevice`.
- **Availability**: Android 13+ asks the recognizer which languages it serves on-device (`checkRecognitionSupport`) and picks the first candidate (app language, then device languages) that is installed or downloadable; online-only languages don't count. A downloadable model is fetched on first use (`triggerModelDownload`, with progress on Android 14+). Google's service first asks the user in a system dialog that shows the download size. Recording fails as `model_unavailable` if the user declines, if the download is only queued for later, or if the model isn't installed within two minutes. Android 12 can't list languages, so it offers the device's default language. Below Android 12, or without an on-device recognizer, `getAvailability` reports unavailable.
- **Fallback**: where voice is unavailable, the voice entry opens the conversation with the keyboard. There is no server recognition fallback.
- **Long recordings**: the recognizer ends a session at each pause, so the module keeps listening until the user stops and joins the finalized segments with spaces. Android 13+ asks for a segmented session, which Google's service keeps open through pauses for up to 5 minutes. Any session that ends anyway restarts.
- **Permission**: only `RECORD_AUDIO`, which is no longer blocked in `app.config.ts`. It is requested when the user first starts a recording; a denial Android would still prompt for is re-asked rather than sent to Settings.
- **Interruptions**: leaving the app, losing audio focus (a call), or the recognizer failing mid-recording ends it and keeps what was heard, as on iOS. Other audio is ducked while recording.

This supersedes "Android's `RECORD_AUDIO` stays blocked" under Consequences and the platform-seam note that `isSupported()` is false on Android. Recognition quality and language coverage vary by device and by which on-device recognition service it ships.
