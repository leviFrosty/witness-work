import Foundation

/// Centralized factory for the widget → app deep link URLs. The string forms
/// must match the route table in `src/lib/linking.ts`. Keeping these in one
/// place makes it cheap to audit when widgets are added.
enum WidgetURLs {
  static let scheme = "witnesswork"

  static let home = URL(string: "\(scheme)://home")!
  static let addTime = URL(string: "\(scheme)://add-time")!
  static let sharedGoodNews = URL(string: "\(scheme)://shared-good-news")!

  /// Opens Add Time with the given `YYYY-MM-DD` date pre-filled. Used by the
  /// Calendar widget when a user taps a day cell — the primary intent on the
  /// calendar is logging hours worked on that day, so the tap goes to Add Time
  /// rather than the Plan Day screen. Plan creation lives on the header "+".
  static func addTime(date: String) -> URL {
    URL(string: "\(scheme)://add-time/\(date)")!
  }

  static func contact(id: String) -> URL {
    URL(string: "\(scheme)://contact/\(id)")!
  }

  /// Opens Contact Details with the given conversation highlighted. Used by
  /// the Appointments widget so tapping a row jumps the user to the matching
  /// follow-up entry.
  static func conversation(contactId: String, conversationId: String) -> URL {
    URL(string: "\(scheme)://contact/\(contactId)/\(conversationId)")!
  }

  /// Opens the Reschedule Conversation modal sheet for an overdue follow-up.
  /// Used by the Appointments widget when the user taps a row whose
  /// `isOverdue` flag is true — they're more likely to want to reschedule than
  /// to view conversation details.
  static func reschedule(contactId: String, conversationId: String) -> URL {
    URL(string: "\(scheme)://reschedule/\(contactId)/\(conversationId)")!
  }

  /// Opens Plan Day with no pre-filled date, used by the Calendar widget's
  /// top-right "+" CTA to create a new plan.
  static let createPlan = URL(string: "\(scheme)://day")!
}
