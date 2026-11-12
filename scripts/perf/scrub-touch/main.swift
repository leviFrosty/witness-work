// Holds one simulated finger on an iOS simulator and moves it up and down
// (or flings it) at a fixed touch sample rate, through FBSimulatorControl's
// HID (the framework AXe ships). Used by scripts/perf/scrub.mjs.
//
// scrub-touch <udid> <x> <bottomY> <topY> <periodMs> <seconds> <hz> <drag|fling>
// Prints {"startedAt":ms,"endedAt":ms,"events":n,"lateMs":worst} on success.
import FBControlCore
import FBSimulatorControl
import Foundation

let args = CommandLine.arguments
guard args.count == 9 else {
  FileHandle.standardError.write(
    "usage: scrub-touch <udid> <x> <bottomY> <topY> <periodMs> <seconds> <hz> <drag|fling>\n"
      .data(using: .utf8)!)
  exit(2)
}
let udid = args[1]
let x = Double(args[2])!
let bottom = Double(args[3])!
let top = Double(args[4])!
let period = Double(args[5])! / 1000
let seconds = Double(args[6])!
let hz = Double(args[7])!
let pattern = args[8]

func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

func wait(until target: UInt64) {
  while true {
    let now = DispatchTime.now().uptimeNanoseconds
    if now >= target { return }
    let remaining = target - now
    if remaining > 2_000_000 { usleep(UInt32((remaining - 1_000_000) / 1000)) }
  }
}

let logger = FBControlCoreGlobalConfiguration.defaultLogger

func run() async throws {
  FBSimulatorControlFrameworkLoader.essentialFrameworks.loadPrivateFrameworksOrAbort()
  FBSimulatorControlFrameworkLoader.xcodeFrameworks.loadPrivateFrameworksOrAbort()
  let control = try FBSimulatorControl.withConfiguration(
    FBSimulatorControlConfiguration(deviceSetPath: nil, logger: logger, reporter: nil))
  guard let simulator = control.set.allSimulators.first(where: { $0.udid == udid }) else {
    throw NSError(domain: "scrub-touch", code: 1, userInfo: [NSLocalizedDescriptionKey: "no simulator \(udid)"])
  }
  let hid = try await simulator.connectToHID()
  let interval = 1 / hz
  let samples = Int((seconds * hz).rounded())
  var events = 0
  var worstLate = 0.0
  let begin = DispatchTime.now().uptimeNanoseconds
  let startedAt = nowMs()
  func at(_ i: Int) -> UInt64 { begin + UInt64(Double(i) * interval * 1e9) }
  func send(_ direction: FBSimulatorHIDDirection, _ y: Double, _ i: Int) async throws {
    let late = Double(DispatchTime.now().uptimeNanoseconds) - Double(at(i))
    worstLate = max(worstLate, late / 1e6)
    try await hid.send(event: .touch(direction: direction, x: x, y: y), logger: logger)
    events += 1
  }
  if pattern == "drag" {
    // Triangle wave: constant finger speed, bottom → top → bottom.
    var y = bottom
    for i in 0...samples {
      wait(until: at(i))
      let phase = (Double(i) * interval).truncatingRemainder(dividingBy: period) / period
      let k = phase < 0.5 ? phase * 2 : 2 - phase * 2
      y = bottom + (top - bottom) * k
      try await send(.down, y, i)
    }
    // Hold still briefly so the release carries no velocity.
    for h in 1...6 {
      wait(until: at(samples + h))
      try await send(.down, y, samples + h)
    }
    try await send(.up, y, samples + 6)
  } else {
    // Each half period is one stroke, lifted at speed.
    let perStroke = max(2, Int((period / 2 * 0.75 * hz).rounded()))
    let strokeGap = Int((period / 2 * hz).rounded())
    var i = 0
    var stroke = 0
    while Double(i) * interval < seconds {
      let from = stroke % 2 == 0 ? bottom : top
      let to = stroke % 2 == 0 ? top : bottom
      for s in 0...perStroke {
        wait(until: at(i + s))
        try await send(.down, from + (to - from) * Double(s) / Double(perStroke), i + s)
      }
      try await send(.up, to, i + perStroke)
      i += strokeGap
      stroke += 1
    }
  }
  let endedAt = nowMs()
  hid.disconnect()
  print("{\"startedAt\":\(Int(startedAt)),\"endedAt\":\(Int(endedAt)),\"events\":\(events),\"lateMs\":\(Int(worstLate))}")
}

let done = DispatchSemaphore(value: 0)
Task {
  do { try await run() } catch {
    FileHandle.standardError.write("scrub-touch: \(error)\n".data(using: .utf8)!)
    exit(1)
  }
  done.signal()
}
done.wait()
