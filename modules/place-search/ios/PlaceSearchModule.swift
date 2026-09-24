import Contacts
import ExpoModulesCore
import Foundation
import MapKit

/**
 * Apple MapKit place search for Plan locations. Autocomplete uses
 * `MKLocalSearchCompleter` so publishers can find points of interest
 * ("Kingdom Hall", a park, a coffee shop) as well as street addresses; resolve
 * turns a picked suggestion into a name, a one-line address, and coordinates.
 *
 * Everything runs on the main queue: `MKLocalSearchCompleter` must be created
 * and driven from the main thread, and it calls its delegate there.
 */
public class PlaceSearchModule: Module {
  private var searcher: PlaceSearchCompleter?

  public func definition() -> ModuleDefinition {
    Name("PlaceSearch")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("placeSearchVersion") {
      1
    }

    AsyncFunction("autocomplete") {
      (query: String, latitude: Double?, longitude: Double?, promise: Promise) in
      let searcher = self.mainSearcher()
      searcher.complete(query: query, center: Self.coordinate(latitude, longitude)) {
        completions in
        let serialized: [[String: Any]] = completions.map { Self.serializeCompletion($0) }
        promise.resolve(serialized as Any?)
      }
    }.runOnQueue(.main)

    AsyncFunction("resolve") { (title: String, subtitle: String, promise: Promise) in
      let searcher = self.mainSearcher()
      searcher.resolve(title: title, subtitle: subtitle) { mapItem in
        guard let mapItem else {
          promise.resolve(nil as Any?)
          return
        }
        let serialized: [String: Any] = Self.serializeMapItem(mapItem)
        promise.resolve(serialized as Any?)
      }
    }.runOnQueue(.main)
  }

  /// Must be called on the main queue.
  private func mainSearcher() -> PlaceSearchCompleter {
    if let searcher {
      return searcher
    }
    let created = PlaceSearchCompleter()
    searcher = created
    return created
  }

  private static func coordinate(_ latitude: Double?, _ longitude: Double?)
    -> CLLocationCoordinate2D?
  {
    guard let latitude, let longitude else { return nil }
    let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    return CLLocationCoordinate2DIsValid(coordinate) ? coordinate : nil
  }

  private static func serializeCompletion(_ completion: MKLocalSearchCompletion) -> [String: Any] {
    return [
      "id": PlaceSearchCompleter.key(title: completion.title, subtitle: completion.subtitle),
      "title": completion.title,
      "subtitle": completion.subtitle,
    ]
  }

  private static func serializeMapItem(_ mapItem: MKMapItem) -> [String: Any] {
    let placemark = mapItem.placemark
    let coordinate = placemark.coordinate
    var place: [String: Any] = [
      "latitude": coordinate.latitude,
      "longitude": coordinate.longitude,
    ]
    let address = formattedAddress(placemark)
    if let address {
      place["address"] = address
    }
    if let name = poiName(mapItem, address: address) {
      place["name"] = name
    }
    return place
  }

  /// Single-line postal address, e.g. "1 Apple Park Way, Cupertino CA 95014, United States".
  private static func formattedAddress(_ placemark: MKPlacemark) -> String? {
    if let postalAddress = placemark.postalAddress {
      let multiline = CNPostalAddressFormatter.string(from: postalAddress, style: .mailingAddress)
      let line = multiline
        .components(separatedBy: .newlines)
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .filter { !$0.isEmpty }
        .joined(separator: ", ")
      if !line.isEmpty {
        return line
      }
    }
    let parts = [
      streetLine(placemark),
      placemark.locality,
      placemark.administrativeArea,
      placemark.postalCode,
      placemark.country,
    ]
    .compactMap { $0 }
    .filter { !$0.isEmpty }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
  }

  private static func streetLine(_ placemark: MKPlacemark) -> String? {
    let parts = [placemark.subThoroughfare, placemark.thoroughfare]
      .compactMap { $0 }
      .filter { !$0.isEmpty }
    return parts.isEmpty ? nil : parts.joined(separator: " ")
  }

  /**
   * The map item's name only when it names a place (a POI), not when MapKit
   * just echoes the street address back as the name.
   */
  private static func poiName(_ mapItem: MKMapItem, address: String?) -> String? {
    guard let name = mapItem.name?.trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty
    else {
      return nil
    }
    if mapItem.pointOfInterestCategory != nil {
      return name
    }
    let placemark = mapItem.placemark
    let addressLike = [
      streetLine(placemark),
      placemark.thoroughfare,
      placemark.locality,
      placemark.subLocality,
      placemark.administrativeArea,
      placemark.postalCode,
      placemark.country,
    ]
    .compactMap { $0?.lowercased() }
    let lowered = name.lowercased()
    if addressLike.contains(lowered) {
      return nil
    }
    if let address, address.lowercased().hasPrefix(lowered) {
      return nil
    }
    return name
  }
}

/**
 * Bridges the delegate-based `MKLocalSearchCompleter` to a single callback per
 * query. A newer query supersedes an older one (the older callback receives an
 * empty list), and a timeout delivers whatever results exist so JS never
 * hangs. Main queue only.
 */
final class PlaceSearchCompleter: NSObject, MKLocalSearchCompleterDelegate {
  private static let timeout: TimeInterval = 4
  private static let biasRadiusMeters: CLLocationDistance = 50_000

  private let completer = MKLocalSearchCompleter()
  private var pending: (([MKLocalSearchCompletion]) -> Void)?
  private var generation = 0
  private var lastRegion: MKCoordinateRegion?
  /// Last delivered completions, keyed by `key(title:subtitle:)`, so resolve can
  /// search on the real `MKLocalSearchCompletion` instead of free text.
  private var completionsById: [String: MKLocalSearchCompletion] = [:]

  override init() {
    super.init()
    completer.delegate = self
    completer.resultTypes = [.pointOfInterest, .address]
  }

  static func key(title: String, subtitle: String) -> String {
    return "\(title)\u{1F}\(subtitle)"
  }

  func complete(
    query: String,
    center: CLLocationCoordinate2D?,
    callback: @escaping ([MKLocalSearchCompletion]) -> Void
  ) {
    // Supersede any in-flight query; JS ignores stale responses anyway.
    finish(with: [])

    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      completer.cancel()
      callback([])
      return
    }

    let region = center.map {
      MKCoordinateRegion(
        center: $0,
        latitudinalMeters: Self.biasRadiusMeters,
        longitudinalMeters: Self.biasRadiusMeters
      )
    }
    let regionChanged = !Self.sameRegion(region, lastRegion)
    if regionChanged {
      completer.region = region ?? MKCoordinateRegion(MKMapRect.world)
      lastRegion = region
    }

    // Re-setting an identical fragment doesn't trigger a new delegate callback.
    if !regionChanged, completer.queryFragment == trimmed, !completer.isSearching {
      remember(completer.results)
      callback(completer.results)
      return
    }

    generation += 1
    let current = generation
    pending = callback
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.timeout) { [weak self] in
      guard let self, self.generation == current else { return }
      self.finish(with: self.completer.results)
    }
    completer.queryFragment = trimmed
  }

  func resolve(title: String, subtitle: String, callback: @escaping (MKMapItem?) -> Void) {
    let request: MKLocalSearch.Request
    if let completion = completionsById[Self.key(title: title, subtitle: subtitle)] {
      request = MKLocalSearch.Request(completion: completion)
    } else {
      request = MKLocalSearch.Request()
      request.naturalLanguageQuery = [title, subtitle]
        .filter { !$0.isEmpty }
        .joined(separator: " ")
      request.resultTypes = [.pointOfInterest, .address]
      if let lastRegion {
        request.region = lastRegion
      }
    }
    MKLocalSearch(request: request).start { response, _ in
      // Search errors (including "not found") resolve to nil for JS.
      callback(response?.mapItems.first)
    }
  }

  func cancel() {
    completer.cancel()
    finish(with: [])
  }

  // MARK: MKLocalSearchCompleterDelegate

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    finish(with: completer.results)
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    // MKError.placemarkNotFound etc.: no suggestions rather than a JS rejection.
    finish(with: [])
  }

  // MARK: Private

  private func finish(with results: [MKLocalSearchCompletion]) {
    guard let callback = pending else { return }
    pending = nil
    generation += 1
    remember(results)
    callback(results)
  }

  private func remember(_ results: [MKLocalSearchCompletion]) {
    guard !results.isEmpty else { return }
    var byId: [String: MKLocalSearchCompletion] = [:]
    for completion in results {
      byId[Self.key(title: completion.title, subtitle: completion.subtitle)] = completion
    }
    completionsById = byId
  }

  private static func sameRegion(_ a: MKCoordinateRegion?, _ b: MKCoordinateRegion?) -> Bool {
    switch (a, b) {
    case (nil, nil):
      return true
    case let (a?, b?):
      return a.center.latitude == b.center.latitude
        && a.center.longitude == b.center.longitude
        && a.span.latitudeDelta == b.span.latitudeDelta
        && a.span.longitudeDelta == b.span.longitudeDelta
    default:
      return false
    }
  }
}
