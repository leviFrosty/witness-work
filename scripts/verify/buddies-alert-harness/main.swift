import Foundation
import UserNotifications

// Runs the Notification Service Extension's own `NotificationService` on one
// relay-shaped push inside the simulator, with the extension's entitlements,
// and prints the alert it would show. `xcrun simctl push` hands notifications
// straight to SpringBoard and never starts a service extension, so this is how
// the extension is exercised locally. See `buddies-alert-harness.mjs`.
let payload =
  try! JSONSerialization.jsonObject(
    with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
let alert = (payload["aps"] as! [String: Any])["alert"] as! [String: String]
let content = UNMutableNotificationContent()
content.title = alert["title"] ?? ""
content.body = alert["body"] ?? ""
content.userInfo = payload
let request = UNNotificationRequest(identifier: "harness", content: content, trigger: nil)
let service = NotificationService()
let done = DispatchSemaphore(value: 0)
service.didReceive(request) { result in
  let out = ["title": result.title, "body": result.body]
  print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
  done.signal()
}
if done.wait(timeout: .now() + 25) == .timedOut {
  print("{\"error\":\"timed out\"}")
  exit(1)
}
