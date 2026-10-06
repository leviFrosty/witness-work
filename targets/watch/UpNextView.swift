import MapKit
import SwiftUI
import WatchKit

/// A Follow-up or Plan from Up Next, opened from Home or the complication:
/// where it is, and for a Plan the service timer.
struct UpNextView: View {
  @Environment(WatchModel.self) private var model
  /// Wrist down: the screen may be seen by the person you're talking with.
  @Environment(\.isLuminanceReduced) private var hidesNames
  let itemId: String
  @State private var isBusy = false

  var body: some View {
    let snapshot = model.snapshot
    TimelineView(.everyMinute) { timeline in
      if let item = UpNext.item(id: itemId, in: snapshot) {
        List {
          VStack(alignment: .leading, spacing: 4) {
            Label(UpNext.heading(item, at: timeline.date, snapshot), systemImage: UpNext.symbol(item))
              .font(.footnote)
              .foregroundStyle(Color.accentColor)
            Text(UpNext.title(item, hidesNames: hidesNames, snapshot))
              .font(.title3.bold())
              .privacySensitive(item.kind == .followUp)
            if let detail = UpNext.detail(item, hidesNames: hidesNames) {
              Text(detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .privacySensitive(item.kind == .followUp)
            }
          }
          .accessibilityElement(children: .combine)

          if let place = item.place {
            Button {
              openDirections(to: place)
            } label: {
              Label(
                L10n.t("directions", snapshot),
                systemImage: "arrow.triangle.turn.up.right.diamond.fill")
            }
            .disabled(isBusy)
          }

          if item.kind == .plan, snapshot?.showsTimeEntry == true, let timer = model.timer {
            if timer.isRunning {
              Label {
                Text(
                  timerInterval: timer.effectiveStartDate()...Date.distantFuture,
                  countsDown: false
                )
                .monospacedDigit()
              } icon: {
                Image(systemName: "timer")
              }
              .foregroundStyle(Color.accentColor)
            } else {
              Button {
                startTimer()
              } label: {
                Label(L10n.t("timerStartAction", snapshot), systemImage: "play.fill")
              }
              .disabled(isBusy)
            }
          }
        }
      } else {
        // It's no longer coming up, e.g. answered or moved on the iPhone.
        ScrollView {
          Text(L10n.t("watchNothingScheduled", snapshot))
            .foregroundStyle(.secondary)
            .padding()
        }
      }
    }
    .navigationTitle(L10n.t("watchUpNext", snapshot))
  }

  private func startTimer() {
    isBusy = true
    Task {
      do {
        try await model.setTimer(.start, origin: .upNext)
        WKInterfaceDevice.current().play(.start)
      } catch {
        model.show(error)
      }
      isBusy = false
    }
  }

  /// Opens Maps on the watch with directions; a place without a coordinate is
  /// looked up by its address first.
  private func openDirections(to place: UpNextItem.Place) {
    isBusy = true
    Task {
      var mapItem: MKMapItem?
      if let latitude = place.latitude, let longitude = place.longitude {
        mapItem = MKMapItem(
          location: CLLocation(latitude: latitude, longitude: longitude), address: nil)
      } else if let address = place.address,
                let request = MKGeocodingRequest(addressString: address) {
        mapItem = try? await request.mapItems.first
      }
      if let mapItem {
        mapItem.name = place.name
        mapItem.openInMaps(launchOptions: [
          MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault
        ])
      } else {
        model.alertKey = "watchDirectionsUnavailable"
      }
      isBusy = false
    }
  }
}
