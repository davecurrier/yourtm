import Foundation

/// Deploys a container's worker to Cloudflare, natively.
///
/// Mirrors `packages/desktop/src/app/api/project/deploy/route.ts`, including the
/// parts that only exist because they were learned the hard way — see
/// `CloudflareClient` for the API's own surprises. The wrangler.toml parsing
/// here is deliberately narrow: it reads the handful of keys a YourTM container
/// uses rather than pretending to be a TOML implementation.
enum NativeDeployer {

    struct Result {
        var workerName: String
        var workerUrl: String?
        var routes: [CloudflareClient.RouteOutcome]
        var usedMigrations: Bool
    }

    enum DeployError: LocalizedError {
        case noProject
        case noCredentials
        case invalidToken
        case noWorker
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .noProject: return "No project is open."
            case .noCredentials:
                return "Cloudflare credentials are not configured. Add an Account ID and API token in Settings."
            case .invalidToken:
                return "Cloudflare rejected the API token. Check it in Settings."
            case .noWorker:
                return "This project has no worker.js, so there is nothing to deploy."
            case .failed(let m): return m
            }
        }
    }

    /// The subset of wrangler.toml a container actually uses.
    struct Wrangler {
        var name: String?
        var bindings: [CloudflareClient.Binding] = []
        var routes: [String] = []
        var zoneName: String?
        var migrationTag: String?
        var migrationClasses: [String] = []
    }

    /// Narrow wrangler.toml reader.
    ///
    /// `[vars]` matters as much as the Durable Object bindings: the metadata
    /// bindings array replaces everything on the script, so a var left out here
    /// is silently deleted from the deployed worker. That is how RUM_SAMPLE_RATE
    /// got dropped once.
    static func parseWrangler(at url: URL) -> Wrangler {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return Wrangler() }
        var w = Wrangler()

        func matches(_ pattern: String, in s: String) -> [[String]] {
            guard let re = try? NSRegularExpression(pattern: pattern, options: [.anchorsMatchLines]) else { return [] }
            return re.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { m in
                (0..<m.numberOfRanges).map { i in
                    Range(m.range(at: i), in: s).map { String(s[$0]) } ?? ""
                }
            }
        }

        w.name = matches(#"^name\s*=\s*"([^"]+)""#, in: text).first?[1]
        w.zoneName = matches(#"^\s*zone_name\s*=\s*"([^"]+)""#, in: text).first?[1]
        w.routes = matches(#"^\s*pattern\s*=\s*"([^"]+)""#, in: text).map { $0[1] }

        for m in matches(#"\{\s*name\s*=\s*"([^"]+)"\s*,\s*class_name\s*=\s*"([^"]+)"\s*\}"#, in: text) {
            w.bindings.append(.init(name: m[1], type: "durable_object_namespace", className: m[2]))
        }

        // [vars] runs to the next table header.
        if let varsRange = text.range(of: #"(?m)^\[vars\]\s*$"#, options: .regularExpression) {
            let rest = String(text[varsRange.upperBound...])
            let block = rest.range(of: #"(?m)^\["#, options: .regularExpression)
                .map { String(rest[..<$0.lowerBound]) } ?? rest
            for m in matches(#"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)""#, in: block) {
                w.bindings.append(.init(name: m[1], type: "plain_text", text: m[2]))
            }
        }

        w.migrationTag = matches(#"^\s*tag\s*=\s*"([^"]+)""#, in: text).first?[1]
        if let classesLine = matches(#"new_classes\s*=\s*\[([^\]]*)\]"#, in: text).first?[1] {
            w.migrationClasses = matches(#""([^"]+)""#, in: classesLine).map { $0[1] }
        }
        return w
    }

    /// Change the RUM sample rate and redeploy.
    ///
    /// Deliberately re-parses wrangler.toml and sends the **full** binding set
    /// with RUM_SAMPLE_RATE overridden. The engine's version sends only
    /// `[RUM_SAMPLE_RATE]`, and because the metadata bindings array replaces
    /// every binding on the script, that silently removes the TELEMETRY
    /// Durable Object binding — the store telemetry is written to. Toggling RUM
    /// would have broken the thing RUM exists to feed.
    static func setRUM(
        projectPath: String,
        containerId: String,
        enabled: Bool,
        sampleRate: Double,
        accountId: String,
        apiToken: String
    ) async throws -> Result {
        let value = enabled ? String(sampleRate) : "0"
        return try await deploy(
            projectPath: projectPath, containerId: containerId, environment: "production",
            accountId: accountId, apiToken: apiToken,
            overrideVars: ["RUM_SAMPLE_RATE": value]
        )
    }

    static func deploy(
        projectPath: String,
        containerId: String,
        environment: String,
        accountId: String,
        apiToken: String,
        overrideVars: [String: String] = [:]
    ) async throws -> Result {
        guard !projectPath.isEmpty else { throw DeployError.noProject }
        guard !accountId.isEmpty, !apiToken.isEmpty else { throw DeployError.noCredentials }

        let root = URL(fileURLWithPath: projectPath)
        let workerURL = root.appendingPathComponent("worker.js")
        guard let script = try? String(contentsOf: workerURL, encoding: .utf8) else {
            throw DeployError.noWorker
        }

        let client = CloudflareClient(accountId: accountId, apiToken: apiToken)
        guard await client.verifyToken() else { throw DeployError.invalidToken }

        var w = parseWrangler(at: root.appendingPathComponent("wrangler.toml"))

        // Apply var overrides on top of the parsed set, never instead of it.
        for (key, value) in overrideVars {
            if let i = w.bindings.firstIndex(where: { $0.name == key && $0.type == "plain_text" }) {
                w.bindings[i].text = value
            } else {
                w.bindings.append(.init(name: key, type: "plain_text", text: value))
            }
        }
        let name = w.name ?? "ytm-\(containerId.lowercased().replacingOccurrences(of: "[^a-z0-9]", with: "-", options: .regularExpression))"

        var migrations: [String: Any]?
        if !w.migrationClasses.isEmpty {
            migrations = ["new_tag": w.migrationTag ?? "v1", "new_classes": w.migrationClasses]
        }

        // Durable Object migrations are a first-creation step. Re-sending the
        // tag against a script that already carries it fails with 10079, so try
        // with and fall back to without — that covers both first deploy and
        // every deploy after it with no separate existence check.
        var usedMigrations = migrations != nil
        do {
            try await client.deployWorker(name: name, script: script,
                                          bindings: w.bindings, migrations: migrations)
        } catch let error as CloudflareClient.CFError
                    where migrations != nil && error.codes.contains(10079) {
            usedMigrations = false
            try await client.deployWorker(name: name, script: script, bindings: w.bindings)
        } catch {
            throw DeployError.failed(error.localizedDescription)
        }

        // Uploading binds no route; that is a separate zone-scoped call, and a
        // worker without one is simply unreachable on the domain.
        var routes: [CloudflareClient.RouteOutcome] = []
        if !w.routes.isEmpty {
            let zone = w.zoneName
                ?? w.routes[0].split(separator: "/")[0].split(separator: ".").suffix(2).joined(separator: ".")
            routes = await client.syncRoutes(zone: zone, patterns: w.routes, script: name)
        }

        var workerUrl: String?
        if let sub = await client.workerSubdomain() { workerUrl = "https://\(name).\(sub).workers.dev" }
        // A custom domain from the routes is more useful than the workers.dev one.
        if let host = w.routes.first?.split(separator: "/").first, !host.contains("*") {
            workerUrl = "https://\(host)"
        }

        return Result(workerName: name, workerUrl: workerUrl,
                      routes: routes, usedMigrations: usedMigrations)
    }
}
