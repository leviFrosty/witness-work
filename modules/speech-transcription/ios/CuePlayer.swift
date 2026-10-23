import AudioToolbox

/**
 * Plays the short start and end cues as system sounds. A recording session
 * silences app audio, and stopping an app player would deactivate the shared
 * session under the microphone; system sounds do neither (`AudioCapture` lets
 * them through while recording) and follow the silent switch.
 *
 * Main thread only.
 */
final class CuePlayer {
  private var sounds: [URL: SystemSoundID] = [:]

  /// `uri` is a local file URL to a short linear PCM sound.
  func play(_ uri: String) {
    guard let url = URL(string: uri), url.isFileURL else { return }
    var id = sounds[url] ?? 0
    if id == 0 {
      guard AudioServicesCreateSystemSoundID(url as CFURL, &id) == kAudioServicesNoError else {
        return
      }
      sounds[url] = id
    }
    AudioServicesPlaySystemSound(id)
  }

  deinit {
    sounds.values.forEach { AudioServicesDisposeSystemSoundID($0) }
  }
}
