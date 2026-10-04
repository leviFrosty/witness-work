import GameController
import UIKit

/// Observes hardware keys without taking focus away from text inputs.
final class NavigationKeyboard {
  static weak var active: NavigationKeyboard?
  var onCommandChanged: ((Bool) -> Void)?
  var onShortcut: ((String) -> Void)?
  private var inputs: Set<String> = []
  private var keyboardInput: GCKeyboardInput?
  private weak var commandController: UIViewController?
  private var keyCommands: [UIKeyCommand] = []
  private var observers: [NSObjectProtocol] = []
  private var commandPressed = false

  func configure(inputs: [String]) {
    self.inputs = Set(inputs)
    if inputs.isEmpty {
      stop()
      return
    }
    installCommands()
    if observers.isEmpty {
      let center = NotificationCenter.default
      observers = [
        center.addObserver(forName: .GCKeyboardDidConnect, object: nil, queue: .main) { [weak self] _ in
          self?.attachKeyboard()
        },
        center.addObserver(forName: .GCKeyboardDidDisconnect, object: nil, queue: .main) { [weak self] _ in
          self?.detachKeyboard()
        },
        center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
          self?.detachKeyboard()
        },
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
          self?.installCommands()
          self?.attachKeyboard()
        },
      ]
      attachKeyboard()
    }
  }

  func stop() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
    detachKeyboard()
    removeCommands()
    if Self.active === self { Self.active = nil }
  }

  func perform(_ command: UIKeyCommand) {
    guard let input = command.input, inputs.contains(input),
      UIApplication.shared.applicationState == .active else { return }
    onShortcut?(input)
  }

  private func installCommands() {
    removeCommands()
    let window = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    guard let controller = window?.rootViewController else { return }
    commandController = controller
    Self.active = self
    keyCommands = inputs.sorted().map { input in
      let command = UIKeyCommand(input: input, modifierFlags: .command,
        action: #selector(UIResponder.witnessWorkNavigate(_:)))
      if #available(iOS 26.0, *) { command.repeatBehavior = .nonRepeatable }
      controller.addKeyCommand(command)
      return command
    }
  }

  private func removeCommands() {
    keyCommands.forEach { commandController?.removeKeyCommand($0) }
    keyCommands = []
    commandController = nil
  }

  private func attachKeyboard() {
    detachKeyboard()
    guard UIApplication.shared.applicationState == .active,
      let keyboard = GCKeyboard.coalesced, let input = keyboard.keyboardInput else { return }
    keyboard.handlerQueue = .main
    keyboardInput = input
    input.keyChangedHandler = { [weak self] keyboard, _, code, _ in
      guard code == .leftGUI || code == .rightGUI else { return }
      self?.updateCommandKey(keyboard)
    }
    setCommandPressed(input.button(forKeyCode: .leftGUI)?.isPressed == true
      || input.button(forKeyCode: .rightGUI)?.isPressed == true)
  }

  private func detachKeyboard() {
    keyboardInput?.keyChangedHandler = nil
    keyboardInput = nil
    setCommandPressed(false)
  }

  private func setCommandPressed(_ pressed: Bool) {
    guard pressed != commandPressed else { return }
    commandPressed = pressed
    onCommandChanged?(pressed)
  }

  private func updateCommandKey(_ keyboard: GCKeyboardInput) {
    guard UIApplication.shared.applicationState == .active else { return }
    let command = keyboard.button(forKeyCode: .leftGUI)?.isPressed == true
      || keyboard.button(forKeyCode: .rightGUI)?.isPressed == true
    setCommandPressed(command)
  }
}

// A unique selector lets UIKit resolve these commands through its responder chain.
extension UIResponder {
  @objc func witnessWorkNavigate(_ command: UIKeyCommand) {
    NavigationKeyboard.active?.perform(command)
  }
}
