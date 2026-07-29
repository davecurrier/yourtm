import Foundation

/// Thin async client for the YourTM engine (Next.js API on localhost).
struct APIClient {
    var baseURL = URL(string: "http://localhost:3344")!

    enum APIError: LocalizedError {
        case http(Int, String)
        case decoding(String)

        var errorDescription: String? {
            switch self {
            case .http(let code, let body): return "HTTP \(code): \(body.prefix(200))"
            case .decoding(let msg): return "Decode error: \(msg)"
            }
        }
    }

    private func request(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 120
        if let body {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
            throw APIError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try decode(await request(path))
    }

    private func post<T: Decodable>(_ path: String, json: [String: Any] = [:]) async throws -> T {
        let body = try JSONSerialization.data(withJSONObject: json)
        return try decode(await request(path, method: "POST", body: body))
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding("\(error)") }
    }

    /// Like `request`, but hands back 4xx/5xx bodies instead of throwing.
    /// The WordPress endpoints answer with a meaningful JSON `error` on 401/409/502,
    /// which is far more useful to show than the status code alone.
    private func requestTolerant(_ path: String, method: String = "GET", json: [String: Any]? = nil) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 120
        if let json {
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }

    // MARK: Endpoints

    func health() async -> Bool {
        (try? await request("/api/settings/project")) != nil
    }

    func project() async throws -> ProjectData {
        try await get("/api/project")
    }

    func settings() async throws -> AppSettings {
        try await get("/api/settings")
    }

    func saveSettings(_ json: [String: Any]) async throws -> APIResult {
        try await post("/api/settings", json: json)
    }

    func setProject(path: String) async throws -> APIResult {
        try await post("/api/settings/project", json: ["path": path])
    }

    func updateAsset(kind: AssetKind, id: String, updates: [String: Any]) async throws -> APIResult {
        if kind == .tags {
            return try await post("/api/project/tags/\(id)", json: ["updates": updates])
        }
        return try await post("/api/project/\(kind.rawValue)/\(id)", json: ["updates": updates])
    }

    func deleteAsset(kind: AssetKind, id: String) async throws -> APIResult {
        let path = kind == .tags ? "/api/project/tags/\(id)" : "/api/project/\(kind.rawValue)/\(id)"
        return try decode(await request(path, method: "DELETE"))
    }

    func createAsset(type: String, template: String?, config: [String: Any]) async throws -> APIResult {
        var json: [String: Any] = ["type": type, "config": config]
        if let template { json["template"] = template }
        return try await post("/api/project/create", json: json)
    }

    func importGTM(json: String) async throws -> ImportResult {
        let body = try JSONSerialization.data(withJSONObject: ["gtmJson": json])
        return try decode(await request("/api/project/import", method: "POST", body: body))
    }

    func clearContainer() async throws -> ClearResult {
        try decode(await request("/api/project/clear", method: "POST", body: Data("{}".utf8)))
    }

    func deploymentInfo() async throws -> DeploymentInfo {
        try await get("/api/project/deployment")
    }

    func deploy(environment: String) async throws -> APIResult {
        // The engine requires an explicit target — an empty body is a 400.
        try await post("/api/project/deploy", json: ["environment": environment])
    }

    func rumStatus() async throws -> RUMStatus {
        try await get("/api/project/rum")
    }

    func setRUM(enabled: Bool, sampleRate: Double) async throws -> APIResult {
        try await post("/api/project/rum", json: ["enabled": enabled, "sampleRate": sampleRate])
    }

    // MARK: WordPress sites

    func wordpressSites() async throws -> [WordPressSite] {
        let resp: WPSitesResponse = try decode(await requestTolerant("/api/wordpress"))
        return resp.sites ?? []
    }

    /// Probe a site's plugin without registering it.
    func wordpressTest(url: String, apiKey: String) async throws -> APIResult {
        try decode(await requestTolerant("/api/wordpress", method: "POST",
                                         json: ["action": "test", "url": url, "api_key": apiKey]))
    }

    func wordpressAddSite(url: String, apiKey: String, containerId: String,
                          environment: String) async throws -> WPSiteResponse {
        try decode(await requestTolerant("/api/wordpress", method: "POST", json: [
            "url": url,
            "api_key": apiKey,
            "container_id": containerId,
            "environment": environment,
        ]))
    }

    func wordpressRemoveSite(id: String) async throws -> APIResult {
        try decode(await requestTolerant("/api/wordpress", method: "DELETE", json: ["id": id]))
    }

    /// Compile the container and push the bundles to one site.
    func wordpressSync(siteId: String, environment: String) async throws -> WPSyncResult {
        try decode(await requestTolerant("/api/wordpress/sync", method: "POST",
                                         json: ["site_id": siteId, "environment": environment]))
    }

    /// `action` is one of `sync`, `refresh`, `purge_cache`.
    func wordpressSiteAction(id: String, action: String) async throws -> APIResult {
        try decode(await requestTolerant("/api/wordpress/sites/\(id)", method: "POST",
                                         json: ["action": action]))
    }

    func wordpressUpdateSite(id: String, updates: [String: Any]) async throws -> APIResult {
        try decode(await requestTolerant("/api/wordpress/sites/\(id)", method: "PUT", json: updates))
    }

    func build() async throws -> Data {
        try await request("/api/build", method: "POST", body: Data("{}".utf8))
    }

    func audit() async throws -> Data {
        try await request("/api/project/audit", method: "POST", body: Data("{}".utf8))
    }

    func devServerStatus() async throws -> DevServerStatus {
        try await get("/api/preview/dev-server")
    }

    func devServer(action: String, port: Int = 3456) async throws -> Data {
        try await request("/api/preview/dev-server", method: "POST",
                          body: try JSONSerialization.data(withJSONObject: ["action": action, "port": port]))
    }

    func recentTelemetry(limit: Int = 200) async throws -> [TelemetryEvent] {
        struct Wrapper: Codable { var events: [TelemetryEvent]? }
        let data = try await request("/api/preview/telemetry?limit=\(limit)")
        if let w = try? JSONDecoder().decode(Wrapper.self, from: data), let e = w.events { return e }
        return (try? JSONDecoder().decode([TelemetryEvent].self, from: data)) ?? []
    }

    /// Server-Sent Events stream of live telemetry.
    func telemetryStream() -> AsyncThrowingStream<TelemetryEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                var req = URLRequest(url: baseURL.appendingPathComponent("/api/preview/telemetry"))
                req.url = URL(string: req.url!.absoluteString + "?stream=true")
                req.timeoutInterval = 3600
                do {
                    let (bytes, _) = try await URLSession.shared.bytes(for: req)
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data: ") else { continue }
                        let payload = Data(line.dropFirst(6).utf8)
                        struct Frame: Codable {
                            var type: String
                            var event: TelemetryEvent?
                            var events: [TelemetryEvent]?
                        }
                        guard let frame = try? JSONDecoder().decode(Frame.self, from: payload) else { continue }
                        if let e = frame.event { continuation.yield(e) }
                        for e in frame.events ?? [] { continuation.yield(e) }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
