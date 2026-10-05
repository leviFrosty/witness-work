import SwiftUI
import WatchKit

/// Adds time for today. From the timer, it saves the timer's time and resets
/// the timer on the iPhone.
struct AddTimeView: View {
  @Environment(WatchModel.self) private var model
  @Environment(\.dismiss) private var dismiss
  let snapshot: WatchSnapshot
  let fromTimer: Bool

  @State private var hours: Int
  @State private var minutes: Int
  @State private var categoryId: String?
  @State private var isSaving = false

  init(snapshot: WatchSnapshot, hours: Int = 0, minutes: Int = 0, fromTimer: Bool = false) {
    self.snapshot = snapshot
    self.fromTimer = fromTimer
    _hours = State(initialValue: min(hours, 23))
    _minutes = State(initialValue: minutes)
  }

  var body: some View {
    List {
      HStack {
        wheel(L10n.t("hours", snapshot), selection: $hours, values: 0..<24)
        wheel(L10n.t("minutes", snapshot), selection: $minutes, values: 0..<60)
      }

      if !snapshot.categories.isEmpty {
        Picker(L10n.t("type", snapshot), selection: $categoryId) {
          Text(L10n.t("standard", snapshot)).tag(String?.none)
          ForEach(snapshot.categories) { category in
            Text(category.name).tag(String?.some(category.id))
          }
        }
      }

      Button {
        save()
      } label: {
        Text(L10n.t("save", snapshot))
          .frame(maxWidth: .infinity)
      }
      .disabled((hours == 0 && minutes == 0) || isSaving)
    }
    .navigationTitle(L10n.t("addTime", snapshot))
  }

  /// A Digital Crown wheel with its label always visible, not only on focus.
  private func wheel(
    _ label: String, selection: Binding<Int>, values: Range<Int>
  ) -> some View {
    VStack(spacing: 2) {
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
      Picker(label, selection: selection) {
        ForEach(values, id: \.self) { Text($0, format: .number).tag($0) }
      }
      .pickerStyle(.wheel)
      .labelsHidden()
      .frame(height: 70)
    }
  }

  private func save() {
    isSaving = true
    Task {
      do {
        if fromTimer {
          try await model.saveTimer(hours: hours, minutes: minutes, categoryId: categoryId)
        } else {
          await model.addEntry(
            hours: hours, minutes: minutes, categoryId: categoryId, origin: .app)
        }
        WKInterfaceDevice.current().play(.success)
        dismiss()
      } catch {
        model.show(error)
      }
      isSaving = false
    }
  }
}
