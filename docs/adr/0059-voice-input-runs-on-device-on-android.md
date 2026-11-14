---
status: accepted
supersedes: [0018]
---

# Voice input runs on-device on Android too

## Context

ADR 0018 made voice input iOS-only: Android's `RECORD_AUDIO` stayed blocked and the speech module's `isSupported()` was false on Android. Scribe AI (ADR 0032) brings voice to Android through the same `modules/speech-transcription` contract, so `index.ts` and the JS that drives it are shared. Photo input is unchanged.

## Decision

- **API**: Android 12+ (`SpeechRecognizer.createOnDeviceSpeechRecognizer`). The module only ever creates that recognizer: never `createSpeechRecognizer`, never Android's voice-input screen, and a network error fails the recording rather than retrying another recognizer. The system's on-device recognition service records and transcribes, so audio never reaches the app's process and nothing is written to disk. Contact names bias recognition through `EXTRA_BIASING_STRINGS` on Android 13+, best effort. The engine reports as `androidOnDevice`.
- **Availability**: Android 13+ asks the recognizer which languages it serves on-device (`checkRecognitionSupport`) and picks the first candidate (app language, then device languages) that is installed or downloadable; online-only languages don't count. A downloadable model is fetched on first use (`triggerModelDownload`, with progress on Android 14+). Google's service first asks the user in a system dialog that shows the download size. Recording fails as `model_unavailable` if the user declines, if the download is only queued for later, or if the model isn't installed within two minutes. Android 12 can't list languages, so it offers the device's default language. Below Android 12, or without an on-device recognizer, `getAvailability` reports unavailable.
- **Fallback**: where voice is unavailable, the voice entry opens the conversation with the keyboard. There is no server recognition fallback.
- **Long recordings**: the recognizer ends a session at each pause, so the module keeps listening until the user stops and joins the finalized segments with spaces. Android 13+ asks for a segmented session, which Google's service keeps open through pauses for up to 5 minutes. Any session that ends anyway restarts.
- **Permission**: only `RECORD_AUDIO`, which is no longer blocked in `app.config.ts`. It is requested when the user first starts a recording; a denial Android would still prompt for is re-asked rather than sent to Settings.
- **Interruptions**: leaving the app, losing audio focus (a call), or the recognizer failing mid-recording ends it and keeps what was heard, as on iOS. Other audio is ducked while recording.

## Consequences

- This replaces two parts of ADR 0018: "Android's `RECORD_AUDIO` stays blocked" under Consequences, and the platform-seam note that `isSupported()` is false on Android.
- Recognition quality and language coverage vary by device and by which on-device recognition service it ships.
