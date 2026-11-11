import Foundation
import Network

// Preview without the engine.
//
// The engine provided two local HTTP services the Preview screen depends on:
//
//   :3344  /api/preview/telemetry — receives beacons from pages running a
//          preview build, and streams them to the app
//   :3456  `ytm dev` (spawned by the engine) — serves freshly built bundles
//
// Both are reimplemented here on Network.framework, at the same ports and
// paths, so a page or bookmarklet that already points at them keeps working.
// Both listen on loopback only: nothing here should be reachable from the LAN.

// MARK: - Minimal HTTP server

/// One request per connection, `Connection: close`. Enough for beacons and for
/// serving a handful of bundles to a browser; not a general-purpose server.
final class LocalHTTPServer: @unchecked Sendable {

    struct Request {
        var method: String
        var path: String
        var query: [String: String]
        var headers: [String: String]   // lower-cased names
        var body: Data
    }

    struct Response {
        var status: Int
        var headers: [String: String] = [:]
        var body: Data = Data()

        static func json(_ object: Any, status: Int = 200, headers: [String: String] = [:]) -> Response {
            let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
            var h = headers
            h["Content-Type"] = "application/json"
            return Response(status: status, headers: h, body: data)
        }
    }

    typealias Handler = @Sendable (Request) async -> Response

    private let listener: NWListener
    private let handler: Handler
    private let queue = DispatchQueue(label: "dev.yourtm.http")
    private static let maxRequestBytes = 2 * 1024 * 1024

    init(port: UInt16, handler: @escaping Handler) throws {
        let params = NWParameters.tcp
        params.requiredInterfaceType = .loopback
        params.allowLocalEndpointReuse = true
        guard let nwPort = NWEndpoint.Port(rawValue: port) else {
            throw NSError(domain: "LocalHTTPServer", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Invalid port \(port)"])
        }
        listener = try NWListener(using: params, on: nwPort)
        self.handler = handler
    }

    /// Starts listening; `onState` reports `nil` once ready, or the failure.
    func start(onState: @escaping @Sendable (Error?) -> Void) {
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready: onState(nil)
            case .failed(let error): onState(error)
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] conn in
            guard let self else { return }
            conn.start(queue: self.queue)
            self.receive(conn, buffer: Data())
        }
        listener.start(queue: queue)
    }

    func stop() {
        listener.cancel()
    }

    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
            guard let self else { conn.cancel(); return }
            var buf = buffer
            if let data { buf.append(data) }
            if let request = Self.parse(buf) {
                let handler = self.handler
                Task {
                    let response = await handler(request)
                    self.send(response, on: conn)
                }
            } else if isComplete || error != nil || buf.count > Self.maxRequestBytes {
                conn.cancel()
            } else {
                self.receive(conn, buffer: buf)
            }
        }
    }

    /// Nil until the headers and the full `Content-Length` body have arrived.
    private static func parse(_ data: Data) -> Request? {
        guard let headerEnd = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        guard let head = String(data: data[..<headerEnd.lowerBound], encoding: .utf8) else { return nil }
        var lines = head.components(separatedBy: "\r\n")
        let requestLine = lines.removeFirst().split(separator: " ")
        guard requestLine.count >= 2 else { return nil }

        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }

        let length = Int(headers["content-length"] ?? "0") ?? 0
        let bodyStart = headerEnd.upperBound
        guard data.count - bodyStart >= length else { return nil }
        let body = data.subdata(in: bodyStart..<(bodyStart + length))

        let target = String(requestLine[1])
        let components = URLComponents(string: target)
        var query: [String: String] = [:]
        for item in components?.queryItems ?? [] { query[item.name] = item.value ?? "" }

        return Request(method: String(requestLine[0]).uppercased(),
                       path: components?.path ?? target,
                       query: query, headers: headers, body: body)
    }

    private func send(_ response: Response, on conn: NWConnection) {
        var head = "HTTP/1.1 \(response.status) \(Self.reason(response.status))\r\n"
        var headers = response.headers
        headers["Content-Length"] = String(response.body.count)
        headers["Connection"] = "close"
        for (k, v) in headers { head += "\(k): \(v)\r\n" }
        head += "\r\n"
        var out = Data(head.utf8)
        out.append(response.body)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }

    private static func reason(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 204: return "No Content"
        case 400: return "Bad Request"
        case 404: return "Not Found"
        case 405: return "Method Not Allowed"
        case 500: return "Internal Server Error"
        default: return "Status"
        }
    }
}

/// Lets a page on a public HTTPS origin beacon to loopback.
///
/// Chrome's Private Network Access drops public -> loopback requests unless the
/// preflight answers with `Access-Control-Allow-Private-Network`. Without it the
/// browser fails silently — `sendBeacon()` still returns true — and preview
/// looks broken with no error anywhere. Carried over from the engine's route.
private let previewCORS: [String: String] = [
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    "Access-Control-Max-Age": "86400",
]

// MARK: - Telemetry receiver (:3344)

@MainActor
final class TelemetryHub: ObservableObject {
    static let port: UInt16 = 3344
    static let endpoint = "http://localhost:3344/api/preview/telemetry"
    private static let maxEvents = 500

    @Published private(set) var events: [TelemetryEvent] = []
    /// Nil while healthy; the reason the receiver is not listening otherwise.
    @Published private(set) var listenError: String?

    private var server: LocalHTTPServer?
    private var subscribers: [UUID: AsyncStream<TelemetryEvent>.Continuation] = [:]

    func start() {
        guard server == nil else { return }
        do {
            let server = try LocalHTTPServer(port: Self.port) { [weak self] request in
                guard let self else { return .init(status: 500) }
                return await self.handle(request)
            }
            server.start { [weak self] error in
                Task { @MainActor in
                    self?.listenError = error.map {
                        "Telemetry receiver could not listen on :\(Self.port) — \($0.localizedDescription). Is another YourTM engine still running?"
                    }
                }
            }
            self.server = server
        } catch {
            listenError = error.localizedDescription
        }
    }

    /// Live events from now on, for the Preview screen's "Go Live".
    func stream() -> AsyncStream<TelemetryEvent> {
        let id = UUID()
        return AsyncStream { continuation in
            subscribers[id] = continuation
            continuation.onTermination = { [weak self] _ in
                Task { @MainActor in self?.subscribers[id] = nil }
            }
        }
    }

    func clear() { events.removeAll() }

    private func handle(_ request: LocalHTTPServer.Request) -> LocalHTTPServer.Response {
        // `/_ytm/telemetry` is the path `ytm dev` used; accept both.
        guard request.path == "/api/preview/telemetry" || request.path == "/_ytm/telemetry" else {
            return .init(status: 404, headers: previewCORS)
        }
        switch request.method {
        case "OPTIONS":
            return .init(status: 204, headers: previewCORS)
        case "POST":
            guard let parsed = try? JSONSerialization.jsonObject(with: request.body) else {
                return .json(["error": "Failed to process telemetry"], status: 400, headers: previewCORS)
            }
            let incoming = (parsed as? [[String: Any]]) ?? [(parsed as? [String: Any]) ?? [:]]
            for raw in incoming { ingest(raw, headers: request.headers) }
            return .json(["status": "ok", "count": incoming.count, "totalEvents": events.count],
                         headers: previewCORS)
        case "GET":
            let limit = Int(request.query["limit"] ?? "") ?? 100
            let since = Double(request.query["since"] ?? "") ?? 0
            let recent = events.filter { ($0.timestamp ?? 0) > since }.suffix(limit)
            let encoded = (try? JSONEncoder().encode(Array(recent))) ?? Data("[]".utf8)
            let list = (try? JSONSerialization.jsonObject(with: encoded)) ?? []
            return .json(["events": list, "total": events.count], headers: previewCORS)
        case "DELETE":
            events.removeAll()
            return .json(["status": "cleared"], headers: previewCORS)
        default:
            return .init(status: 405, headers: previewCORS)
        }
    }

    /// Normalise one beacon the way the engine did, then publish it.
    private func ingest(_ raw: [String: Any], headers: [String: String]) {
        var e = raw
        let now = Date().timeIntervalSince1970 * 1000
        let tag = (e["tagId"] as? String) ?? "unknown"
        let ts = (e["timestamp"] as? Double) ?? now
        // A unique id per beacon: two executions of the same tag in the same
        // millisecond are two events, not a duplicate.
        e["id"] = "\(tag)-\(Int(ts))-\(UUID().uuidString.prefix(6))"
        e["timestamp"] = ts
        e["tagName"] = e["tagName"] ?? tag
        e["type"] = e["type"] ?? "tag_execution"
        if e["success"] == nil { e["success"] = true }
        if e["pageUrl"] == nil, let ref = headers["referer"] { e["pageUrl"] = ref }

        guard let data = try? JSONSerialization.data(withJSONObject: e),
              let event = try? JSONDecoder().decode(TelemetryEvent.self, from: data) else { return }
        events.append(event)
        if events.count > Self.maxEvents { events.removeFirst(events.count - Self.maxEvents) }
        for continuation in subscribers.values { continuation.yield(event) }
    }
}

// MARK: - Dev server (:3456)

/// Serves preview builds of the open container, rebuilt whenever a source file
/// changes. Replaces the engine spawning `node ytm dev`.
@MainActor
final class DevServer: ObservableObject {
    nonisolated static let defaultPort: UInt16 = 3456

    @Published private(set) var running = false
    @Published private(set) var port: UInt16 = DevServer.defaultPort
    @Published private(set) var lastError: String?
    @Published private(set) var lastBuild: Date?

    private var server: LocalHTTPServer?
    private var projectPath = ""
    private var containerId = ""
    private var bundles: [String: String] = [:]
    private var builtFromStamp: Date?

    var status: DevServerStatus {
        DevServerStatus(running: running, port: Int(port), projectPath: projectPath,
                        isValidProject: NativeSettings.isValidProject(projectPath),
                        recentOutput: lastError.map { [$0] })
    }

    func start(projectPath: String, containerId: String, port: UInt16 = DevServer.defaultPort) async {
        stop()
        guard NativeSettings.isValidProject(projectPath) else {
            lastError = "No valid YourTM project found. Please link a project in Settings."
            return
        }
        self.projectPath = projectPath
        self.containerId = containerId
        self.port = port
        bundles = [:]
        builtFromStamp = nil
        lastError = nil
        await rebuildIfStale()

        do {
            let server = try LocalHTTPServer(port: port) { [weak self] request in
                guard let self else { return .init(status: 500) }
                return await self.handle(request)
            }
            server.start { [weak self] error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.lastError = "Dev server could not listen on :\(port) — \(error.localizedDescription)"
                        self.running = false
                    } else {
                        self.running = true
                    }
                }
            }
            self.server = server
        } catch {
            lastError = error.localizedDescription
        }
    }

    func stop() {
        server?.stop()
        server = nil
        running = false
    }

    private func handle(_ request: LocalHTTPServer.Request) async -> LocalHTTPServer.Response {
        if request.method == "OPTIONS" { return .init(status: 204, headers: previewCORS) }
        guard request.method == "GET" else { return .init(status: 405, headers: previewCORS) }

        await rebuildIfStale()

        let name = String(request.path.dropFirst())
        if name.isEmpty || name == "index.html" {
            var h = previewCORS
            h["Content-Type"] = "text/html; charset=utf-8"
            return .init(status: 200, headers: h, body: Data(indexPage().utf8))
        }
        guard let code = bundles[name] else { return .init(status: 404, headers: previewCORS) }
        var h = previewCORS
        h["Content-Type"] = "application/javascript; charset=utf-8"
        h["Cache-Control"] = "no-cache"
        return .init(status: 200, headers: h, body: Data(code.utf8))
    }

    /// Rebuild when any file under the container's sources is newer than the
    /// last build. Checked per request rather than with FSEvents: a stat walk of
    /// a few hundred files costs microseconds, and there is no watcher to leak.
    private func rebuildIfStale() async {
        let stamp = newestSourceDate()
        if let built = builtFromStamp, let stamp, stamp <= built, !bundles.isEmpty { return }
        do {
            let built = try await NativeBuilder.buildAll(
                projectPath: projectPath, containerId: containerId,
                debug: true, minify: false, previewEndpoint: TelemetryHub.endpoint
            )
            bundles = Dictionary(built.map { ($0.name, $0.code) }, uniquingKeysWith: { a, _ in a })
            builtFromStamp = stamp ?? Date()
            lastBuild = Date()
            lastError = nil
        } catch {
            lastError = "Build failed: \(error.localizedDescription)"
        }
    }

    private func newestSourceDate() -> Date? {
        let root = URL(fileURLWithPath: projectPath)
        var newest: Date?
        let roots = [root.appendingPathComponent("yourtm"), root.appendingPathComponent("yourtm.config.ts")]
        for start in roots {
            let enumerator = FileManager.default.enumerator(
                at: start, includingPropertiesForKeys: [.contentModificationDateKey])
            var urls: [URL] = [start]
            while let next = enumerator?.nextObject() as? URL { urls.append(next) }
            for url in urls {
                if let d = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
                   newest.map({ d > $0 }) ?? true {
                    newest = d
                }
            }
        }
        return newest
    }

    private func indexPage() -> String {
        let rows = bundles.keys.sorted().map { name in
            "<tr><td><a href=\"/\(name)\">\(name)</a></td><td>\(bundles[name]!.utf8.count / 1024) KB</td></tr>"
        }.joined()
        let snippet = "&lt;script src=\"http://localhost:\(port)/core.js\"&gt;&lt;/script&gt;"
        return """
        <!doctype html><html><head><meta charset="utf-8"><title>YourTM dev server — \(containerId)</title>
        <style>body{font:15px -apple-system,sans-serif;max-width:760px;margin:48px auto;padding:0 16px}
        table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}
        code{background:#f2f2f2;padding:2px 6px;border-radius:4px}</style></head><body>
        <h1>YourTM dev server</h1><p>Container <code>\(containerId)</code>, preview build.
        Telemetry is sent to the YourTM app.</p>
        <p>Load on a page with <code>\(snippet)</code></p>
        <table>\(rows)</table></body></html>
        """
    }
}
