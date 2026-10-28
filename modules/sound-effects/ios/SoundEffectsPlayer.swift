import AVFoundation
import QuartzCore

/**
 * Plays short sounds the moment they're asked for. Each is decoded into memory
 * once (`load`), and a few voices stay attached to a running engine, so a play
 * only schedules a buffer. `AVPlayer` (expo-audio) reads from the file instead,
 * and starts 50–100 ms late, later still when re-triggered mid-sound.
 *
 * Every voice runs through a varispeed unit, so a faster rate raises the pitch
 * with it, like a tape. The engine stops, and lets the session go so other
 * apps' audio can resume, a few seconds after the last sound. It leaves the
 * session's category alone, so sounds follow the silent switch as before.
 *
 * Thread-safe: all state lives on `queue`.
 */
final class SoundEffectsPlayer {
  private static let voiceCount = 8
  private static let idleSeconds: TimeInterval = 5

  private let queue = DispatchQueue(label: "witnesswork.sound-effects", qos: .userInteractive)
  /// Every buffer is converted to this, so any voice can play any sound.
  private let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
  private var engine: AVAudioEngine?
  private var voices: [Voice] = []
  private var buffers: [String: AVAudioPCMBuffer] = [:]
  private var idleWork: DispatchWorkItem?
  private var configurationObserver: NSObjectProtocol?
  private var resetObserver: NSObjectProtocol?

  private final class Voice {
    let node = AVAudioPlayerNode()
    let varispeed = AVAudioUnitVarispeed()
    /// When its sound ends, in `CACurrentMediaTime` seconds.
    var busyUntil: CFTimeInterval = 0
  }

  init() {
    // A media services reset invalidates every engine: build a new one.
    resetObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.teardown() }
    }
  }

  deinit {
    if let resetObserver { NotificationCenter.default.removeObserver(resetObserver) }
    if let configurationObserver { NotificationCenter.default.removeObserver(configurationObserver) }
  }

  /// Decodes `uri`, a local file URL, and starts the engine for what follows.
  func load(_ key: String, uri: String) -> Bool {
    guard let url = URL(string: uri), url.isFileURL, let buffer = decode(url) else {
      return false
    }
    queue.sync {
      buffers[key] = buffer
      if start() { stopWhenIdle(after: 0) }
    }
    return true
  }

  /// Plays `key` now, on an idle voice or the one closest to done.
  func play(_ key: String, rate: Double, volume: Double) {
    queue.async {
      guard let buffer = self.buffers[key], self.start() else { return }
      let now = CACurrentMediaTime()
      guard
        let voice = self.voices.first(where: { $0.busyUntil <= now })
          ?? self.voices.min(by: { $0.busyUntil < $1.busyUntil })
      else { return }
      let rate = min(4, max(0.25, rate))
      voice.varispeed.rate = Float(rate)
      voice.node.volume = Float(min(1, max(0, volume)))
      voice.node.scheduleBuffer(buffer, at: nil, options: .interrupts)
      if !voice.node.isPlaying { voice.node.play() }
      let seconds = Double(buffer.frameLength) / buffer.format.sampleRate / rate
      voice.busyUntil = now + seconds
      self.stopWhenIdle(after: seconds)
    }
  }

  func unloadAll() {
    queue.async {
      self.buffers.removeAll()
      self.pause()
      self.teardown()
    }
  }

  // MARK: - On `queue`

  /// Whether the engine runs, building and starting it when it doesn't.
  private func start() -> Bool {
    if engine == nil { build() }
    guard let engine else { return false }
    if !engine.isRunning {
      do {
        try engine.start()
      } catch {
        return false
      }
      // Idle voices keep playing nothing, so a scheduled buffer starts at once.
      voices.forEach { $0.node.play() }
    }
    return true
  }

  private func build() {
    let engine = AVAudioEngine()
    voices = (0..<Self.voiceCount).map { _ in
      let voice = Voice()
      engine.attach(voice.node)
      engine.attach(voice.varispeed)
      engine.connect(voice.node, to: voice.varispeed, format: format)
      engine.connect(voice.varispeed, to: engine.mainMixerNode, format: format)
      return voice
    }
    engine.prepare()
    self.engine = engine
    // A route or format change (headphones, a call, Scribe's recording) stops
    // the engine: build a fresh one on the next play.
    configurationObserver = NotificationCenter.default.addObserver(
      forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.teardown() }
    }
  }

  private func teardown() {
    idleWork?.cancel()
    idleWork = nil
    if let configurationObserver {
      NotificationCenter.default.removeObserver(configurationObserver)
      self.configurationObserver = nil
    }
    engine?.stop()
    voices = []
    engine = nil
  }

  private func stopWhenIdle(after seconds: TimeInterval) {
    idleWork?.cancel()
    let work = DispatchWorkItem { [weak self] in self?.pause() }
    idleWork = work
    queue.asyncAfter(deadline: .now() + seconds + Self.idleSeconds, execute: work)
  }

  /// Stops the engine and lets the session go, so other apps' audio resumes.
  private func pause() {
    guard let engine, engine.isRunning else { return }
    engine.stop()
    let session = AVAudioSession.sharedInstance()
    // A recording owns the session; leave it active.
    guard session.category != .record, session.category != .playAndRecord else { return }
    try? session.setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func decode(_ url: URL) -> AVAudioPCMBuffer? {
    guard
      let file = try? AVAudioFile(forReading: url),
      let source = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
      (try? file.read(into: source)) != nil
    else { return nil }
    if source.format == format { return source }

    guard let converter = AVAudioConverter(from: source.format, to: format) else { return nil }
    converter.downmix = true
    let frames = Double(source.frameLength) * format.sampleRate / source.format.sampleRate
    guard
      let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames) + 1)
    else { return nil }
    var fed = false
    var error: NSError?
    converter.convert(to: output, error: &error) { _, status in
      if fed {
        status.pointee = .endOfStream
        return nil
      }
      fed = true
      status.pointee = .haveData
      return source
    }
    return error == nil ? output : nil
  }
}
