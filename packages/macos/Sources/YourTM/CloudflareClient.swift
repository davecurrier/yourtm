import Foundation

/// Cloudflare API client — the deploy path, natively.
///
/// Everything here is plain REST over URLSession; the value is not the
/// transport but the accumulated behaviour of this particular API, which is
/// unobvious in several places and cost real debugging time:
///
/// - Account-owned tokens (`cfat_`) do not verify at `/user/tokens/verify`.
///   They must be checked against `/accounts/{id}/tokens/verify`, or a
///   perfectly good token reads as invalid.
/// - Script listing is **paginated at 10**. An unpaginated read makes a
///   deployed worker look missing purely because of where it falls
///   alphabetically.
/// - Uploading a script binds **no route**. Routes are a separate zone-scoped
///   API, so a worker deployed without that step is unreachable on the domain.
/// - Route patterns match the **full URL**, so `/ytmcore.js` needs a trailing
///   `*` or a query string stops it matching.
/// - The metadata `bindings` array **replaces every binding** on the script.
///   Anything omitted is silently removed, `[vars]` included.
/// - Durable Object migrations are first-creation only. Re-sending `new_tag`
///   against an existing script fails with error 10079.
struct CloudflareClient {
    var accountId: String
    var apiToken: String

    private static let base = URL(string: "https://api.cloudflare.com/client/v4")!

    enum CFError: LocalizedError {
        case http(Int, String)
        case api([String])
        case malformed(String)

        var errorDescription: String? {
            switch self {
            case .http(let code, let body): return "Cloudflare HTTP \(code): \(body.prefix(300))"
            case .api(let messages): return messages.joined(separator: "; ")
            case .malformed(let m): return "Unexpected Cloudflare response: \(m)"
            }
        }
        /// Cloudflare error codes carried through so callers can branch on them,
        /// e.g. 10079 for a migration precondition.
        var codes: [Int] {
            guard case .api(let messages) = self else { return [] }
            return messages.compactMap { m in
                guard let r = m.range(of: #"\[(\d+)\]"#, options: .regularExpression) else { return nil }
                return Int(m[r].dropFirst().dropLast())
            }
        }
    }

    // MARK: Transport

    private func send(
        _ path: String,
        method: String = "GET",
        json: Any? = nil,
        multipart: (boundary: String, body: Data)? = nil
    ) async throws -> [String: Any] {
        var req = URLRequest(url: Self.base.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 120
        req.setValue("Bearer \(apiToken)", forHTTPHeaderField: "Authorization")
        if let json {
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let multipart {
            req.httpBody = multipart.body
            req.setValue("multipart/form-data; boundary=\(multipart.boundary)",
                         forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await URLSession.shared.data(for: req)
        let text = String(data: data, encoding: .utf8) ?? ""
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            throw CFError.http(code, text)
        }
        if (object["success"] as? Bool) == false {
            let errors = (object["errors"] as? [[String: Any]]) ?? []
            let messages = errors.map { e in
                let code = e["code"] as? Int
                let msg = e["message"] as? String ?? "unknown error"
                return code.map { "[\($0)] \(msg)" } ?? msg
            }
            throw CFError.api(messages.isEmpty ? ["Cloudflare rejected the request"] : messages)
        }
        return object
    }

    private func result(_ object: [String: Any]) -> Any? { object["result"] }

    // MARK: Auth

    /// Verify the token, trying the account-scoped endpoint first.
    ///
    /// `/user/tokens/verify` only works for user-owned tokens; an account-owned
    /// one returns an error there even though it is perfectly valid.
    func verifyToken() async -> Bool {
        if (try? await send("accounts/\(accountId)/tokens/verify")) != nil { return true }
        if (try? await send("user/tokens/verify")) != nil { return true }
        return (try? await send("accounts/\(accountId)")) != nil
    }

    // MARK: Workers

    struct WorkerScript { var id: String; var modifiedOn: String? }

    /// All worker scripts, following pagination.
    ///
    /// The API returns 10 per page. Reading only the first page is how a
    /// deployed worker comes to look missing.
    func listWorkers() async throws -> [WorkerScript] {
        var page = 1
        var all: [WorkerScript] = []
        while true {
            let object = try await send("accounts/\(accountId)/workers/scripts?page=\(page)&per_page=50")
            let rows = (result(object) as? [[String: Any]]) ?? []
            all += rows.compactMap { r in
                (r["id"] as? String).map { WorkerScript(id: $0, modifiedOn: r["modified_on"] as? String) }
            }
            let info = object["result_info"] as? [String: Any]
            let total = info?["total_pages"] as? Int ?? 1
            if page >= total || rows.isEmpty { break }
            page += 1
        }
        return all
    }

    func workerExists(_ name: String) async -> Bool {
        ((try? await listWorkers()) ?? []).contains { $0.id == name }
    }

    struct Binding {
        var name: String
        var type: String
        var text: String?
        var className: String?
        var namespaceId: String?

        var payload: [String: Any] {
            var d: [String: Any] = ["name": name, "type": type]
            if let text { d["text"] = text }
            if let className { d["class_name"] = className }
            if let namespaceId { d["namespace_id"] = namespaceId }
            return d
        }
    }

    /// Upload a worker in modules format.
    ///
    /// Note this binds no route — see `syncWorkerRoutes`. Migrations are
    /// first-creation only; callers should retry without them on error 10079.
    func deployWorker(
        name: String,
        script: String,
        bindings: [Binding] = [],
        compatibilityDate: String = "2024-01-01",
        migrations: [String: Any]? = nil
    ) async throws {
        var metadata: [String: Any] = [
            "main_module": "worker.js",
            "compatibility_date": compatibilityDate,
            // Replaces ALL bindings on the script; omissions are removals.
            "bindings": bindings.map(\.payload),
        ]
        if let migrations { metadata["migrations"] = migrations }

        let boundary = "ytm-\(UUID().uuidString)"
        var body = Data()
        func part(_ headers: String, _ payload: Data) {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append(headers.data(using: .utf8)!)
            body.append("\r\n\r\n".data(using: .utf8)!)
            body.append(payload)
            body.append("\r\n".data(using: .utf8)!)
        }
        part("""
             Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r
             Content-Type: application/javascript+module
             """, Data(script.utf8))
        part("""
             Content-Disposition: form-data; name="metadata"; filename="metadata.json"\r
             Content-Type: application/json
             """, try JSONSerialization.data(withJSONObject: metadata))
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        _ = try await send("accounts/\(accountId)/workers/scripts/\(name)",
                           method: "PUT", multipart: (boundary, body))
    }

    /// `<name>.<subdomain>.workers.dev`, when the subdomain is enabled.
    func workerSubdomain() async -> String? {
        guard let object = try? await send("accounts/\(accountId)/workers/subdomain"),
              let r = result(object) as? [String: Any] else { return nil }
        return r["subdomain"] as? String
    }

    // MARK: Zones and routes

    func zoneId(forName name: String) async throws -> String? {
        let object = try await send("zones?name=\(name)")
        let rows = (result(object) as? [[String: Any]]) ?? []
        return rows.first?["id"] as? String
    }

    struct Route { var id: String; var pattern: String; var script: String? }

    func listRoutes(zoneId: String) async throws -> [Route] {
        let object = try await send("zones/\(zoneId)/workers/routes")
        return ((result(object) as? [[String: Any]]) ?? []).compactMap { r in
            guard let id = r["id"] as? String, let pattern = r["pattern"] as? String else { return nil }
            return Route(id: id, pattern: pattern, script: r["script"] as? String)
        }
    }

    struct RouteOutcome { var pattern: String; var status: String; var error: String? }

    /// Make the zone's routes match `patterns`, pointing at `script`.
    ///
    /// Idempotent: an identical route is left alone, one pointing elsewhere is
    /// repointed, a missing one is created. Failures are reported rather than
    /// thrown — the script is already live by this stage, and zone-scoped route
    /// permissions are a separate grant that not every token has.
    func syncRoutes(zone: String, patterns: [String], script: String) async -> [RouteOutcome] {
        guard let zid = (try? await zoneId(forName: zone)) ?? nil else {
            return patterns.map { RouteOutcome(pattern: $0, status: "failed",
                                               error: "zone \(zone) not found or not readable") }
        }
        let existing = (try? await listRoutes(zoneId: zid)) ?? []
        var outcomes: [RouteOutcome] = []
        for pattern in patterns {
            if let match = existing.first(where: { $0.pattern == pattern }) {
                if match.script == script {
                    outcomes.append(RouteOutcome(pattern: pattern, status: "exists"))
                } else {
                    do {
                        _ = try await send("zones/\(zid)/workers/routes/\(match.id)", method: "PUT",
                                           json: ["pattern": pattern, "script": script])
                        outcomes.append(RouteOutcome(pattern: pattern, status: "reassigned"))
                    } catch {
                        outcomes.append(RouteOutcome(pattern: pattern, status: "failed",
                                                     error: error.localizedDescription))
                    }
                }
                continue
            }
            do {
                _ = try await send("zones/\(zid)/workers/routes", method: "POST",
                                   json: ["pattern": pattern, "script": script])
                outcomes.append(RouteOutcome(pattern: pattern, status: "created"))
            } catch {
                outcomes.append(RouteOutcome(pattern: pattern, status: "failed",
                                             error: error.localizedDescription))
            }
        }
        return outcomes
    }
}
