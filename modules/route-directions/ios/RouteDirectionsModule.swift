import ExpoModulesCore
import Foundation
import MapKit

/**
 * Apple MapKit driving directions for the route builder: one leg at a time,
 * its road shape, distance, and expected travel time, so the map draws roads
 * instead of straight lines and the timeline uses real drive times.
 *
 * MapKit throttles directions per app (`loadingThrottled`), so JS asks only for
 * legs it hasn't seen and keeps the answers.
 */
public class RouteDirectionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RouteDirections")

    // JS checks this so OTA updates never call into a binary without the module.
    Constant("routeDirectionsVersion") {
      1
    }

    AsyncFunction("directions") {
      (fromLatitude: Double, fromLongitude: Double, toLatitude: Double, toLongitude: Double,
       promise: Promise) in
      let from = CLLocationCoordinate2D(latitude: fromLatitude, longitude: fromLongitude)
      let to = CLLocationCoordinate2D(latitude: toLatitude, longitude: toLongitude)
      guard CLLocationCoordinate2DIsValid(from), CLLocationCoordinate2DIsValid(to) else {
        promise.reject("directions_failed", "Invalid coordinate")
        return
      }

      let request = MKDirections.Request()
      request.source = Self.mapItem(from)
      request.destination = Self.mapItem(to)
      request.transportType = .automobile
      request.requestsAlternateRoutes = false

      MKDirections(request: request).calculate { response, error in
        if let error {
          if let failure = DirectionsFailure.from(error) {
            promise.reject(failure.code, failure.message)
          } else {
            promise.resolve(nil as Any?)
          }
          return
        }
        guard let route = response?.routes.first else {
          promise.resolve(nil as Any?)
          return
        }
        let serialized: [String: Any] = [
          "distanceMeters": route.distance,
          "durationSeconds": route.expectedTravelTime,
          "coordinates": Self.flatCoordinates(route.polyline),
        ]
        promise.resolve(serialized as Any?)
      }
    }.runOnQueue(.main)
  }

  private static func mapItem(_ coordinate: CLLocationCoordinate2D) -> MKMapItem {
    if #available(iOS 26.0, *) {
      return MKMapItem(
        location: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude),
        address: nil
      )
    }
    return MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
  }

  /// `[lat, lng, lat, lng, …]`: one flat array crosses the bridge cheaply.
  private static func flatCoordinates(_ polyline: MKPolyline) -> [Double] {
    var coordinates = [CLLocationCoordinate2D](
      repeating: kCLLocationCoordinate2DInvalid,
      count: polyline.pointCount
    )
    polyline.getCoordinates(&coordinates, range: NSRange(location: 0, length: polyline.pointCount))
    var flat: [Double] = []
    flat.reserveCapacity(coordinates.count * 2)
    for coordinate in coordinates {
      flat.append(coordinate.latitude)
      flat.append(coordinate.longitude)
    }
    return flat
  }
}

/**
 * Why directions failed. `code` matches the JS network error vocabulary
 * (`offline`, `timeout`, `rate_limited`), or `directions_failed` for anything
 * else. "No route" isn't a failure: the leg keeps its estimate.
 */
struct DirectionsFailure: Error {
  let code: String
  let message: String

  /// Nil for "no route between these points".
  static func from(_ error: Error) -> DirectionsFailure? {
    let nsError = error as NSError
    if let url = Self.urlError(nsError) {
      let code = url.code == NSURLErrorTimedOut ? "timeout" : "offline"
      return DirectionsFailure(code: code, message: url.localizedDescription)
    }
    if nsError.domain == MKError.errorDomain {
      switch MKError.Code(rawValue: UInt(nsError.code)) {
      case .directionsNotFound, .placemarkNotFound:
        return nil
      case .loadingThrottled:
        return DirectionsFailure(code: "rate_limited", message: nsError.localizedDescription)
      default:
        break
      }
    }
    return DirectionsFailure(
      code: "directions_failed",
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
