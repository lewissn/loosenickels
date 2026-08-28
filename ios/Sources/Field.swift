import Foundation
import CoreLocation
import WeatherKit

/*
 What the instrument knows.

 The archive's position on precision is that it records the accuracy it
 is willing to claim rather than the accuracy the instrument offers. On a
 phone those turn out to be the same number: CLLocation reports its own
 horizontal accuracy in metres, which is exactly what the schema means by
 `precision` and exactly what the survey plot draws as a ring. Nothing
 here has to be estimated, and nothing has to be typed.
 */

struct Fix {
    var coordinates: Coordinates
    var placeName: String
    var region: String?
    var country: String?
    /// Absent when WeatherKit is unavailable or not yet entitled.
    var weather: String?
}

enum FieldError: LocalizedError {
    case denied
    case unavailable

    var errorDescription: String? {
        switch self {
        case .denied:
            return "Location is off for this app. The record can still be filed without a position."
        case .unavailable:
            return "No position yet. The record can still be filed without one."
        }
    }
}

// MARK: - Position

final class LocationReader: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func current() async throws -> CLLocation {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation

            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            case .denied, .restricted:
                finish(.failure(FieldError.denied))
            default:
                manager.requestLocation()
            }
        }
    }

    /// Resumes once and once only. The delegate can report more than once.
    private func finish(_ result: Result<CLLocation, Error>) {
        guard let continuation else { return }
        self.continuation = nil
        continuation.resume(with: result)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        case .denied, .restricted:
            finish(.failure(FieldError.denied))
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            finish(.failure(FieldError.unavailable))
            return
        }
        finish(.success(location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(.failure(error))
    }
}

// MARK: - Weather

enum Sky {
    /// "Overcast, still, 9 °C" — the register the archive already writes in.
    static func describe(_ weather: CurrentWeather) -> String {
        let condition = weather.condition.description
        let celsius = weather.temperature.converted(to: .celsius).value
        let wind = weather.wind.speed.converted(to: .kilometersPerHour).value

        return "\(condition), \(describe(wind: wind)), \(Int(celsius.rounded())) °C"
    }

    private static func describe(wind kilometresPerHour: Double) -> String {
        switch kilometresPerHour {
        case ..<2: return "still"
        case ..<12: return "a light wind"
        case ..<29: return "a breeze"
        case ..<50: return "windy"
        default: return "a gale"
        }
    }
}

// MARK: - The reading

@MainActor
final class FieldConditions: ObservableObject {
    @Published private(set) var fix: Fix?
    @Published private(set) var isReading = false
    @Published private(set) var note: String?

    private let reader = LocationReader()

    func read() async {
        isReading = true
        note = nil
        defer { isReading = false }

        let location: CLLocation
        do {
            location = try await reader.current()
        } catch {
            note = (error as? LocalizedError)?.errorDescription
                ?? "No position. The record can still be filed without one."
            return
        }

        var placeName = "Unnamed position"
        var region: String?
        var country: String?

        /* A failed reverse geocode is not worth reporting: the position is
           the part that matters and it is already in hand. */
        if let placemark = try? await CLGeocoder().reverseGeocodeLocation(location).first {
            placeName = placemark.name
                ?? placemark.locality
                ?? placemark.subLocality
                ?? placeName
            region = placemark.administrativeArea
            country = placemark.country
        }

        /* WeatherKit needs an entitlement on the App ID. Until that is
           configured this simply returns nothing and the weather line is
           left off the record, which is the honest outcome. */
        var weather: String?
        if let current = try? await WeatherService.shared.weather(for: location, including: .current) {
            weather = Sky.describe(current)
        }

        let altitude = location.verticalAccuracy >= 0 ? location.altitude : nil

        fix = Fix(
            coordinates: Coordinates(
                lat: location.coordinate.latitude,
                lon: location.coordinate.longitude,
                /* Renamed with the schema: the database column is
                   `accuracy_m` and the value is metres of horizontal
                   error, which "precision" read as the opposite of. */
                accuracy: location.horizontalAccuracy > 0
                    ? (location.horizontalAccuracy * 10).rounded() / 10
                    : nil,
                elevation: altitude.map { ($0 * 10).rounded() / 10 }
            ),
            placeName: placeName,
            region: region,
            country: country,
            weather: weather
        )
    }

    func clear() {
        fix = nil
        note = nil
    }
}
