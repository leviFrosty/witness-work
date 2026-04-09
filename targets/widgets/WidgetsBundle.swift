import SwiftUI
import WidgetKit

@main
struct WitnessWorkWidgets: WidgetBundle {
  var body: some Widget {
    ReportWidget()
    CalendarWidget()
    AppointmentsWidget()
    ContactsWidget()
  }
}
