import Foundation

/// Reads telemetry straight from a deployed Cloudflare Worker.
///
/// This is the path that works for a hosted site: the page beacons same-origin
/// to the worker (no CORS, no local-network permission), and the app polls the
/// worker's Durable Object from here. Native code, so browser CORS never applies.
struct WorkerClient {
    var baseURL: String

    /// Route prefix differs by deployment: workers.dev subdomains expose
    /// `/_ytm/*`, custom-domain routes may use `/ytm/*`. Try both.
    private static let prefixes = ["/_ytm", "/ytm"]

    struct Stats: Codable {
        var totalEvents: Int?
        var successRate: Double?
        var avgLatency: Double?
        var p50Latency: Double?
        var p95Latency: Double?
        var p99Latency: Double?
        var eventsPerMinute: Double?
        var lastUpdated: Double?
    }

    private struct EventsResponse: Codable {
        var events: [TelemetryEvent]
        var total: Int?
    }

    enum WorkerError: LocalizedError {
        case badURL
        case unreachable(String)

        var errorDescription: String? {
            switch self {
            case .badURL: return "Enter the worker's base URL, e.g. https://dev.yoursite.com"
            case .unreachable(let why): return "Worker unreachable: \(why)"
            }
        }
    }

    private var normalizedBase: String {
        var s = baseURL.trimmingCharacters(in: .whitespaces)
        if s.isEmpty { return s }
        if !s.hasPrefix("http") { s = "https://" + s }
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    private func get(_ path: String) async throws -> Data {
        guard let url = URL(string: normalizedBase + path) else { throw WorkerError.badURL }
        var req = URLRequest(url: url)
        req.timeoutInterval = 20
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, http.statusCode < 400 else {
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            throw WorkerError.unreachable("HTTP \(code) on \(path)")
        }
        return data
    }

    /// Fetch recent events, trying each known route prefix.
    func events(limit: Int = 200) async throws -> [TelemetryEvent] {
        guard !normalizedBase.isEmpty else { throw WorkerError.badURL }
        var lastError: Error = WorkerError.unreachable("no route matched")
        for prefix in Self.prefixes {
            do {
                let data = try await get("\(prefix)/telemetry/events?limit=\(limit)")
                return try JSONDecoder().decode(EventsResponse.self, from: data).events
            } catch {
                lastError = error
            }
        }
        throw lastError
    }

    func stats() async throws -> Stats {
        guard !normalizedBase.isEmpty else { throw WorkerError.badURL }
        var lastError: Error = WorkerError.unreachable("no route matched")
        for prefix in Self.prefixes {
            do {
                let data = try await get("\(prefix)/telemetry/stats")
                return try JSONDecoder().decode(Stats.self, from: data)
            } catch {
                lastError = error
            }
        }
        throw lastError
    }

    /// Is the worker up? Used for the connection dot.
    func health() async -> Bool {
        for prefix in Self.prefixes {
            let data = try? await get("\(prefix)/health")
            if data != nil { return true }
        }
        return false
    }
}
