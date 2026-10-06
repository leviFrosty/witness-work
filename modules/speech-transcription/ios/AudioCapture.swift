import AVFoundation

/**
 * Microphone capture for one transcription session. Buffers go straight to the
 * recognizer in memory; nothing is written to disk.
 *
 * Owns the shared audio session while recording and restores the previous
 * category afterwards, so the confetti chime (ambient playback) keeps working
 * after a voice log.
 */
final class AudioCapture: @unchecked Sendable {
  /// A phone call, Siri, or an audio route change ended capture early.
  var onInterrupted: (() -> Void)?
  /// Normalized input level (0...1), throttled for a recording indicator.
  var onLevel: ((Float) -> Void)?

  private let engine = AVAudioEngine()
  private var converter: AVAudioConverter?
  private var savedSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
  private var observers: [NSObjectProtocol] = []
  private var lastLevelAt: CFTimeInterval = 0
  private var running = false

  /// Starts the microphone. `targetFormat` converts each buffer when the
  /// recognizer needs a different format than the hardware delivers.
  func start(targetFormat: AVAudioFormat?, onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws {
    let session = AVAudioSession.sharedInstance()
    savedSession = (session.category, session.mode, session.categoryOptions)
    try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      restoreSession()
      throw SpeechErrors.audioUnavailable()
    }
    if let targetFormat, targetFormat != inputFormat {
      converter = AVAudioConverter(from: inputFormat, to: targetFormat)
      // No priming: the first buffer must not be swallowed as lead-in.
      converter?.primeMethod = .none
    }

    input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
      guard let self else { return }
      self.meter(buffer)
      if let converter = self.converter, let targetFormat {
        if let converted = Self.convert(buffer, with: converter, to: targetFormat) {
          onBuffer(converted)
        }
      } else {
        onBuffer(buffer)
      }
    }

    engine.prepare()
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      restoreSession()
      throw SpeechErrors.audioUnavailable()
    }
    running = true
    observeInterruptions()
  }

  func stop() {
    guard running else { return }
    running = false
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    restoreSession()
  }

  private func restoreSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setActive(false, options: .notifyOthersOnDeactivation)
    if let (category, mode, options) = savedSession {
      try? session.setCategory(category, mode: mode, options: options)
    }
    savedSession = nil
  }

  private func observeInterruptions() {
    let center = NotificationCenter.default
    let end: (Notification) -> Void = { [weak self] _ in self?.onInterrupted?() }
    observers.append(
      center.addObserver(
        forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
      ) { note in
        let type = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt)
          .flatMap(AVAudioSession.InterruptionType.init(rawValue:))
        if type == .began { end(note) }
      })
    // A route change (AirPods connecting) reconfigures the engine and stops it.
    observers.append(
      center.addObserver(
        forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main, using: end))
    observers.append(
      center.addObserver(
        forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main,
        using: end))
  }

  private func meter(_ buffer: AVAudioPCMBuffer) {
    guard let onLevel, let samples = buffer.floatChannelData?[0] else { return }
    let now = CACurrentMediaTime()
    guard now - lastLevelAt >= 0.08 else { return }
    lastLevelAt = now
    let count = Int(buffer.frameLength)
    guard count > 0 else { return }
    var sum: Float = 0
    for index in 0..<count { sum += samples[index] * samples[index] }
    let rms = sqrt(sum / Float(count))
    // Map roughly -50 dB (room tone) ... 0 dB to 0...1.
    let decibels = 20 * log10(max(rms, 0.000_01))
    onLevel(min(max((decibels + 50) / 50, 0), 1))
  }

  private static func convert(
    _ buffer: AVAudioPCMBuffer, with converter: AVAudioConverter, to format: AVAudioFormat
  ) -> AVAudioPCMBuffer? {
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 1
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      return nil
    }
    var consumed = false
    var error: NSError?
    let status = converter.convert(to: output, error: &error) { _, inputStatus in
      if consumed {
        inputStatus.pointee = .noDataNow
        return nil
      }
      consumed = true
      inputStatus.pointee = .haveData
      return buffer
    }
    guard status != .error, error == nil, output.frameLength > 0 else { return nil }
    return output
  }
}
