import Foundation

/// The words of a named Buddies alert, as `buddyAlertText` in
/// `src/features/buddies/lib/pushAlertText.ts` writes them: who did what in the
/// title, and the day and time or the badge in the body. Never householder
/// data: a Follow-up shows only its day and time, and a Plan none of its text.
struct AlertText: Equatable {
  let title: String
  let body: String?
}

struct AlertWording {
  /// A key's string in the app's language (`L10n.t`).
  let string: (String) -> String
  /// The app's language, for weekday and month names.
  let language: String
  /// The Region's order and clock, as the app formats dates.
  let dayFirst: Bool
  let clock24: Bool

  private static let reactionEmoji = [
    "party": "🎉",
    "confetti": "🎊",
    "fire": "🔥",
    "clap": "👏",
    "thumbsUp": "👍",
    "raisedHands": "🙌",
  ]

  private static let placeholder = try! NSRegularExpression(pattern: "\\{\\{(\\w+)\\}\\}")

  /// A key's string with its `{{name}}` placeholders filled in one pass, as
  /// i18n-js fills them, so a name can't fill another placeholder.
  func t(_ key: String, _ values: [String: String] = [:]) -> String {
    let template = string(key) as NSString
    var text = ""
    var last = 0
    let all = NSRange(location: 0, length: template.length)
    for match in Self.placeholder.matches(in: template as String, range: all) {
      let name = template.substring(with: match.range(at: 1))
      text += template.substring(with: NSRange(location: last, length: match.range.location - last))
      text += values[name] ?? template.substring(with: match.range)
      last = match.range.location + match.range.length
    }
    return text + template.substring(from: last)
  }

  private func formatter(_ format: String) -> DateFormatter {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: Locale.identifier(.icu, from: language))
    // A Plan's day and start are its sender's local calendar: shown as written.
    formatter.timeZone = TimeZone(identifier: "UTC")
    formatter.dateFormat = format
    return formatter
  }

  /// "Sat, Oct 10 · 10:00 AM", as `alertWhenText` writes it.
  func when(_ when: AlertWhen) -> String {
    let parse = formatter("yyyy-MM-dd")
    parse.locale = Locale(identifier: "en_US_POSIX")
    guard let date = parse.date(from: when.d) else { return when.d }
    var parts = [formatter(dayFirst ? "EEE, d MMM" : "EEE, MMM d").string(from: date)]
    if let s = when.s {
      let start = date.addingTimeInterval(TimeInterval(s * 60))
      parts.append(formatter(clock24 ? "HH:mm" : "h:mm a").string(from: start))
    }
    return parts.joined(separator: " · ")
  }

  /// "Year Round, Silver", or a One-time Badge's name.
  func badge(_ badge: SharedBadge) -> String {
    let name = t("badge_\(badge.c)_name")
    guard let level = badge.l else { return name }
    return t("badges_titleWithLevel", ["name": name, "level": t("badgeLevel_\(level)")])
  }

  func text(for alert: Alert) -> AlertText {
    switch alert {
    case .claimed(let name):
      return AlertText(
        title: t("buddies_alertClaimed", ["name": name]),
        body: t("buddies_pushInviteClaimedBody"))
    case .paired(let name):
      return AlertText(
        title: t("buddies_notifPaired", ["name": name]),
        body: t("buddies_pushPairConfirmedBody"))
    case .share(let action, let shareType, let name, let when):
      let titles =
        shareType == "plan"
        ? [
          "invite": "buddies_notifPlanInvite",
          "update": "buddies_notifPlanUpdate",
          "cancel": "buddies_notifPlanCancel",
        ]
        : [
          "invite": "buddies_notifFollowUpInvite",
          "update": "buddies_notifFollowUpUpdate",
          "cancel": "buddies_notifFollowUpCancel",
        ]
      return AlertText(
        title: t(titles[action] ?? titles["update"]!, ["name": name]),
        body: when.map(self.when))
    case .reply(let reply, let name, let shareType, let when):
      let title = reply == "going" ? "buddies_notifReplyGoing" : "buddies_notifReplyDeclined"
      let yours = shareType == "followUp" ? "buddies_alertYourFollowUp" : "buddies_alertYourPlan"
      return AlertText(
        title: t(title, ["name": name]),
        body: when.map { t(yours, ["when": self.when($0)]) })
    case .joinRequest(let name, let when):
      return AlertText(
        title: t("buddies_notifJoinRequest", ["name": name]),
        body: t("buddies_alertYourPlan", ["when": self.when(when)]))
    case .badge(let name, let badges):
      if badges.isEmpty {
        return AlertText(title: t("buddies_notifBadge", ["name": name]), body: nil)
      }
      let title = badges.count == 1 ? "buddies_alertBadgeEarned" : "buddies_alertBadgesEarned"
      return AlertText(
        title: t(title, ["name": name]),
        body: badges.map(badge).joined(separator: " · "))
    case .badgeReaction(let name, let reaction, let badge):
      return AlertText(
        title: t(
          "buddies_alertBadgeReaction",
          ["name": name, "emoji": Self.reactionEmoji[reaction] ?? ""]),
        body: self.badge(badge))
    }
  }
}
