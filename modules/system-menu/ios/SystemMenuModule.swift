import ExpoModulesCore
import UIKit

struct SystemMenuAction: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var enabled: Bool = true
}

struct SystemMenuGroup: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  @Field var actions: [SystemMenuAction] = []
}

/// UIKit only builds the menu; existing JavaScript flows handle every action.
public class SystemMenuModule: Module {
  private var groups: [SystemMenuGroup] = []
  private var configured = false
  private var keyboard: NavigationKeyboard?

  public func definition() -> ModuleDefinition {
    Name("SystemMenu")
    Events("onAction", "onCommandKeyChanged", "onNavigationShortcut")

    AsyncFunction("configureNavigationShortcuts") { [weak self] (inputs: [String]) -> Bool in
      guard let self, #available(iOS 26.0, *), UIDevice.current.userInterfaceIdiom == .pad else {
        return false
      }
      if self.keyboard == nil {
        let keyboard = NavigationKeyboard()
        keyboard.onCommandChanged = { [weak self] pressed in
          self?.sendEvent("onCommandKeyChanged", ["pressed": pressed])
        }
        keyboard.onShortcut = { [weak self] input in
          self?.sendEvent("onNavigationShortcut", ["input": input])
        }
        self.keyboard = keyboard
      }
      self.keyboard?.configure(inputs: inputs)
      return true
    }.runOnQueue(.main)

    OnDestroy { [weak self] in
      let keyboard = self?.keyboard
      DispatchQueue.main.async {
        keyboard?.stop()
      }
    }

    AsyncFunction("configure") { [weak self] (groups: [SystemMenuGroup]) -> Bool in
      guard let self, #available(iOS 26.0, *), UIDevice.current.userInterfaceIdiom == .pad else {
        return false
      }
      self.groups = groups
      if !self.configured {
        let configuration = UIMainMenuSystem.Configuration()
        configuration.documentPreference = .removed
        configuration.printingPreference = .removed
        configuration.findingPreference = .removed
        configuration.textFormattingPreference = .removed
        UIMainMenuSystem.shared.setBuildConfiguration(configuration) { [weak self] builder in
          self?.buildMenu(builder)
        }
        self.configured = true
      } else {
        UIMenuSystem.main.setNeedsRebuild()
      }
      return true
    }.runOnQueue(.main)
  }

  @available(iOS 26.0, *)
  private func buildMenu(_ builder: UIMenuBuilder) {
    guard !groups.isEmpty else { return }
    builder.remove(menu: .view)
    builder.remove(menu: .format)

    for group in groups {
      let identifier: UIMenu.Identifier
      switch group.id {
      case "application": identifier = .application
      case "file": identifier = .file
      case "edit": identifier = .edit
      case "help": identifier = .help
      default: continue
      }
      let actions = group.actions.map { item in
        UIAction(
          title: item.title,
          identifier: UIAction.Identifier("witnesswork.\(item.id)"),
          attributes: item.enabled ? [] : [.disabled]
        ) { [weak self] _ in
          self?.sendEvent("onAction", ["action": item.id])
        }
      }
      let section = UIMenu(title: "", options: .displayInline, children: actions)
      // Keep Apple's Settings command; put the in-app entry below it.
      if identifier == .application, builder.menu(for: .preferences) != nil {
        builder.insertChild(section, atEndOfMenu: .preferences)
      } else if builder.menu(for: identifier) != nil {
        builder.insertChild(section, atEndOfMenu: identifier)
      } else {
        let menu = UIMenu(title: group.title, identifier: identifier, children: [section])
        if identifier == .file {
          builder.insertSibling(menu, afterMenu: .application)
        } else {
          builder.insertChild(menu, atEndOfMenu: .root)
        }
      }
    }
  }
}
