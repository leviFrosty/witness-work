import ExpoModulesCore
import UIKit

/**
 * Background time for short work JS starts (`UIApplication.beginBackgroundTask`):
 * iOS launches the app in the background for a background task or a push and
 * suspends it as soon as that's handled, even mid-request. While a task is
 * held, the app keeps running, up to the time iOS allows; when that runs out,
 * the task ends here, so iOS never kills the app for holding one too long.
 */
public class BackgroundTimeModule: Module {
  private let lock = NSLock()
  private var nextId = 0
  private var tasks: [Int: UIBackgroundTaskIdentifier] = [:]
  /** Begun but not stored yet, and those whose time ran out meanwhile. */
  private var beginning: Set<Int> = []
  private var expiredEarly: Set<Int> = []

  public func definition() -> ModuleDefinition {
    Name("BackgroundTime")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("backgroundTimeVersion") {
      1
    }

    // 0 when iOS gives no time (it's about to suspend the app anyway).
    Function("begin") { (name: String) -> Int in
      return self.begin(name)
    }

    Function("end") { (id: Int) in
      self.end(id)
    }

    OnDestroy {
      self.endAll()
    }
  }

  private func begin(_ name: String) -> Int {
    lock.lock()
    nextId += 1
    let id = nextId
    beginning.insert(id)
    lock.unlock()

    // Callable off the main thread; the handler runs on the main thread.
    let task = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
      self?.end(id)
    }

    lock.lock()
    beginning.remove(id)
    let expired = expiredEarly.remove(id) != nil
    if !expired && task != .invalid {
      tasks[id] = task
    }
    lock.unlock()

    if task == .invalid {
      return 0
    }
    if expired {
      UIApplication.shared.endBackgroundTask(task)
      return 0
    }
    return id
  }

  private func end(_ id: Int) {
    lock.lock()
    let task = tasks.removeValue(forKey: id)
    if task == nil && beginning.contains(id) {
      expiredEarly.insert(id)
    }
    lock.unlock()
    if let task {
      UIApplication.shared.endBackgroundTask(task)
    }
  }

  private func endAll() {
    lock.lock()
    let all = Array(tasks.values)
    tasks.removeAll()
    lock.unlock()
    for task in all {
      UIApplication.shared.endBackgroundTask(task)
    }
  }
}
