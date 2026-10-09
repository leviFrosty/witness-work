import Contacts
import ExpoModulesCore
import Foundation
import MapKit

/**
 * Apple MapKit place search for Plan locations and contact addresses.
 * Autocomplete uses `MKLocalSearchCompleter` so publishers can find points of
 * interest ("Kingdom Hall", a park, a coffee shop) as well as street addresses;
 * resolve turns a picked suggestion into a name, a one-line address, its
 * postal parts, and coordinates.
 *
 * Everything runs on the main queue: `MKLocalSearchCompleter` must be created
 * and driven from the main thread, and it calls its delegate there.
 */
public class PlaceSearchModule: Module {
  private var searcher: PlaceSearchCompleter?

  public func definition() -> ModuleDefinition {
    Name("PlaceSearch")

    // JS checks this so OTA updates never call into a binary without the module.
    // 2: `scope` argument and `postalAddress` on resolved places.
    Constant("placeSearchVersion") {
      2
    }

    AsyncFunction("autocomplete") {
      (query: String, latitude: Double?, longitude: Double?, scope: String?, promise: Promise) in
      let searcher = self.mainSearcher()
      searcher.complete(
        query: query,
        center: Self.coordinate(latitude, longitude),
        addressesOnly: scope == "address"
      ) { result in
        switch result {
        case .success(let completions):
          let serialized: [[String: Any]] = completions.map { Self.serializeCompletion($0) }
          promise.resolve(serialized as Any?)
        case .failure(let failure):
          promise.reject(failure.code, failure.message)
        }
      }
    }.runOnQueue(.main)

    AsyncFunction("resolve") { (title: String, subtitle: String, promise: Promise) in
      let searcher = self.mainSearcher()
      searcher.resolve(title: title, subtitle: subtitle) { result in
        switch result {
        case .success(let mapItem):
          guard let mapItem else {
            promise.resolve(nil as Any?)
            return
          }
          let serialized: [String: Any] = Self.serializeMapItem(mapItem)
          promise.resolve(serialized as Any?)
        case .failure(let failure):
          promise.reject(failure.code, failure.message)
        }
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
    let postal = postalParts(placemark)
    if !postal.isEmpty {
      place["postalAddress"] = postal
    }
    return place
  }

  /// Address fields for forms that store them separately, e.g. a contact's
  /// line 1, city, and zip. Empty parts are left out.
  private static func postalParts(_ placemark: MKPlacemark) -> [String: String] {
    var street = streetLine(placemark)
    var city = placemark.locality
    var state = placemark.administrativeArea
    var zip = placemark.postalCode
    var country = placemark.country
    if let postalAddress = placemark.postalAddress {
      if !postalAddress.street.isEmpty { street = postalAddress.street }
      if !postalAddress.city.isEmpty { city = postalAddress.city }
      if !postalAddress.state.isEmpty { state = postalAddress.state }
      if !postalAddress.postalCode.isEmpty { zip = postalAddress.postalCode }
      if !postalAddress.country.isEmpty { country = postalAddress.country }
    }
    // A street can span lines ("1 Main St\nApt 4"); the rest becomes line 2.
    let streetLines = (street ?? "")
      .components(separatedBy: .newlines)
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
    let parts: [String: String?] = [
      "line1": streetLines.first,
      "line2": streetLines.count > 1 ? streetLines.dropFirst().joined(separator: ", ") : nil,
      "city": city,
      "state": state,
      "zip": zip,
      "country": country,
    ]
    return parts.compactMapValues { value in
      guard let value = value?.trimmingCharacters(in: .whitespaces), !value.isEmpty else {
        return nil
      }
      return value
    }
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
 * Why a search failed. `code` matches the JS network error vocabulary
 * (`offline`, `timeout`, `rate_limited`), or `place_search_failed` for a
 * MapKit service error, so JS can tell "nothing found" from "couldn't search".
 */
struct PlaceSearchFailure: Error {
  let code: String
  let message: String

  static let timedOut = PlaceSearchFailure(code: "timeout", message: "Place search timed out")

  /// Nil for "not found", which is an empty result rather than a failure.
  static func from(_ error: Error) -> PlaceSearchFailure? {
    let nsError = error as NSError
    if let url = Self.urlError(nsError) {
      let code = url.code == NSURLErrorTimedOut ? "timeout" : "offline"
      return PlaceSearchFailure(code: code, message: url.localizedDescription)
    }
    if nsError.domain == MKError.errorDomain {
      switch MKError.Code(rawValue: UInt(nsError.code)) {
      case .placemarkNotFound, .directionsNotFound:
        return nil
      case .loadingThrottled:
        return PlaceSearchFailure(code: "rate_limited", message: nsError.localizedDescription)
      default:
        break
      }
    }
    return PlaceSearchFailure(
      code: "place_search_failed",
      message: "\(nsError.domain) \(nsError.code)"
    )
  }

  private static func urlError(_ error: NSError) -> NSError? {
    if error.domain == NSURLErrorDomain { return error }
    if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
      return urlError(underlying)
    }
    return nil
  }
}

/**
 * Bridges the delegate-based `MKLocalSearchCompleter` to a single callback per
 * query. A newer query supersedes an older one (the older callback receives an
 * empty list). A timeout delivers whatever results exist, or a timeout failure
 * when there are none yet, so JS never hangs. Main queue only.
 */
final class PlaceSearchCompleter: NSObject, MKLocalSearchCompleterDelegate {
  private static let timeout: TimeInterval = 4
  private static let resolveTimeout: TimeInterval = 8
  private static let biasRadiusMeters: CLLocationDistance = 50_000

  private let completer = MKLocalSearchCompleter()
  private var pending: ((Result<[MKLocalSearchCompletion], PlaceSearchFailure>) -> Void)?
  private var generation = 0
  private var lastRegion: MKCoordinateRegion?
  private var addressesOnly = false
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
    addressesOnly: Bool,
    callback: @escaping (Result<[MKLocalSearchCompletion], PlaceSearchFailure>) -> Void
  ) {
    // Supersede any in-flight query; JS ignores stale responses anyway.
    finish(with: [])

    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      completer.cancel()
      callback(.success([]))
      return
    }

    #if DEBUG
      // A simulator can't go offline, so dev builds fake MapKit failures for
      // queries like "ww-fail:offline" to exercise the real failure path.
      if let forced = Self.forcedFailure(trimmed) {
        pending = callback
        self.completer(completer, didFailWithError: forced)
        return
      }
    #endif

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
    let typesChanged = addressesOnly != self.addressesOnly
    if typesChanged {
      self.addressesOnly = addressesOnly
      completer.resultTypes = addressesOnly ? [.address] : [.pointOfInterest, .address]
    }

    // Re-setting an identical fragment doesn't trigger a new delegate callback.
    if !regionChanged, !typesChanged, completer.queryFragment == trimmed,
      !completer.isSearching
    {
      remember(completer.results)
      callback(.success(completer.results))
      return
    }

    generation += 1
    let current = generation
    pending = callback
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.timeout) { [weak self] in
      guard let self, self.generation == current else { return }
      let results = self.completer.results
      if results.isEmpty, self.completer.isSearching {
        self.finish(.failure(.timedOut))
      } else {
        self.finish(with: results)
      }
    }
    completer.queryFragment = trimmed
  }

  func resolve(
    title: String,
    subtitle: String,
    callback: @escaping (Result<MKMapItem?, PlaceSearchFailure>) -> Void
  ) {
    let request: MKLocalSearch.Request
    if let completion = completionsById[Self.key(title: title, subtitle: subtitle)] {
      request = MKLocalSearch.Request(completion: completion)
    } else {
      request = MKLocalSearch.Request()
      request.naturalLanguageQuery = [title, subtitle]
        .filter { !$0.isEmpty }
        .joined(separator: " ")
      request.resultTypes = addressesOnly ? [.address] : [.pointOfInterest, .address]
      if let lastRegion {
        request.region = lastRegion
      }
    }
    let search = MKLocalSearch(request: request)
    var settled = false
    let settle: (Result<MKMapItem?, PlaceSearchFailure>) -> Void = { result in
      guard !settled else { return }
      settled = true
      callback(result)
    }
    // MKLocalSearch has no timeout of its own.
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.resolveTimeout) {
      guard !settled else { return }
      search.cancel()
      settle(.failure(.timedOut))
    }
    search.start { response, error in
      // "Not found" resolves to nil, so JS keeps the picked text; anything
      // else is a failure JS can show.
      if let error, let failure = PlaceSearchFailure.from(error) {
        settle(.failure(failure))
      } else {
        settle(.success(response?.mapItems.first))
      }
    }
  }

  func cancel() {
    completer.cancel()
    finish(with: [])
  }

  #if DEBUG
    private static func forcedFailure(_ query: String) -> NSError? {
      switch query {
      case "ww-fail:offline":
        return NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
      case "ww-fail:throttled":
        return NSError(domain: MKError.errorDomain, code: Int(MKError.Code.loadingThrottled.rawValue))
      case "ww-fail:server":
        return NSError(domain: MKError.errorDomain, code: Int(MKError.Code.serverFailure.rawValue))
      case "ww-fail:notfound":
        return NSError(domain: MKError.errorDomain, code: Int(MKError.Code.placemarkNotFound.rawValue))
      default:
        return nil
      }
    }
  #endif

  // MARK: MKLocalSearchCompleterDelegate

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    finish(with: completer.results)
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    // Not found means no suggestions; anything else (offline, throttled, a
    // MapKit outage) rejects so JS shows an error instead of "No places found".
    if let failure = PlaceSearchFailure.from(error) {
      finish(.failure(failure))
    } else {
      finish(with: [])
    }
  }

  // MARK: Private

  private func finish(with results: [MKLocalSearchCompletion]) {
    remember(results)
    finish(.success(results))
  }

  private func finish(_ result: Result<[MKLocalSearchCompletion], PlaceSearchFailure>) {
    guard let callback = pending else { return }
    pending = nil
    generation += 1
    callback(result)
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
