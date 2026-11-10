import UIKit

/// Reports Command-Return from a hardware keyboard, including while a text input has focus.
final class SubmitKeyboard {
  static weak var active: SubmitKeyboard?
  var onSubmit: (() -> Void)?
  private weak var commandController: UIViewController?
  private var command: UIKeyCommand?
  private var observer: NSObjectProtocol?

  func start() {
    install()
    guard observer == nil else { return }
    observer = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in
      self?.install()
    }
  }

  func stop() {
    if let observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    remove()
    if Self.active === self { Self.active = nil }
  }

  func perform() {
    guard UIApplication.shared.applicationState == .active else { return }
    onSubmit?()
  }

  private func install() {
    remove()
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    guard let controller = window?.rootViewController else { return }
    let command = UIKeyCommand(input: "\r", modifierFlags: .command,
      action: #selector(UIResponder.witnessWorkSubmit(_:)))
    // A focused text view would otherwise take Return before the responder chain sees it.
    command.wantsPriorityOverSystemBehavior = true
    if #available(iOS 26.0, *) { command.repeatBehavior = .nonRepeatable }
    controller.addKeyCommand(command)
    commandController = controller
    self.command = command
    Self.active = self
  }

  private func remove() {
    if let command { commandController?.removeKeyCommand(command) }
    command = nil
    commandController = nil
  }
}

extension UIResponder {
  @objc func witnessWorkSubmit(_ command: UIKeyCommand) {
    SubmitKeyboard.active?.perform()
  }
}
