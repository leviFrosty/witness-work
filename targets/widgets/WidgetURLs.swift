import Foundation

/// Centralized factory for the widget → app deep link URLs. The string forms
/// must match the route table in `src/lib/linking.ts`. Keeping these in one
/// place makes it cheap to audit when widgets are added.
enum WidgetURLs {
  static let scheme = "witnesswork"

  static let home = URL(string: "\(scheme)://home")!
  static let addTime = URL(string: "\(scheme)://add-time")!
  static let sharedGoodNews = URL(string: "\(scheme)://shared-good-news")!

  static func contact(id: String) -> URL {
    URL(string: "\(scheme)://contact/\(id)")!
  }

  /// Opens Contact Details with the given conversation highlighted. Used by
  /// the Appointments widget so tapping a row jumps the user to the matching
  /// follow-up entry.
  static func conversation(contactId: String, conversationId: String) -> URL {
    URL(string: "\(scheme)://contact/\(contactId)/\(conversationId)")!
  }
}
