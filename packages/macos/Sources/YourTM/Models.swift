import Foundation

// MARK: - Flexible JSON value (API fields vary per asset type)

enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { self = .null }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }

    var displayString: String {
        switch self {
        case .string(let s): return s
        case .number(let n): return n == n.rounded() ? String(Int(n)) : String(n)
        case .bool(let b): return b ? "true" : "false"
        case .array(let a): return a.map(\.displayString).joined(separator: ", ")
        case .object: return "{…}"
        case .null: return ""
        }
    }
}

// MARK: - Assets

enum AssetKind: String, CaseIterable, Identifiable {
    case tags, triggers, variables, zones
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var singular: String {
        switch self {
        case .tags: return "Tag"
        case .triggers: return "Trigger"
        case .variables: return "Variable"
        case .zones: return "Zone"
        }
    }
    var systemImage: String {
        switch self {
        case .tags: return "tag"
        case .triggers: return "bolt"
        case .variables: return "curlybraces"
        case .zones: return "square.grid.2x2"
        }
    }
}

/// One tag / trigger / variable / zone. Fields differ per kind, so we keep
/// the well-known ones typed and everything else in `extra`.
struct Asset: Identifiable, Hashable {
    var id: String
    var name: String
    var type: String?
    var description: String?
    var code: String?
    var triggers: [String]
    var blocking: [String]
    var zones: [String]
    var consent: [String]
    var patterns: [String]
    var sourcePath: String?
    var priority: Int?
    var value: String?
    var key: String?
    var event: String?
    var selector: String?
    var extra: [String: JSONValue]

    static let knownKeys: Set<String> = [
        "id", "name", "type", "description", "code", "triggers", "blocking",
        "zones", "consent", "patterns", "sourcePath", "priority", "value",
        "key", "event", "selector",
    ]
}

extension Asset: Codable {
    struct DynamicKey: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
        init(_ s: String) { stringValue = s }
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: DynamicKey.self)
        func str(_ k: String) -> String? { try? c.decodeIfPresent(String.self, forKey: .init(k)) }
        func strs(_ k: String) -> [String] { (try? c.decodeIfPresent([String].self, forKey: .init(k))) ?? [] }

        name = str("name") ?? str("id") ?? "unnamed"
        id = str("id") ?? name
        type = str("type")
        description = str("description")
        code = str("code")
        triggers = strs("triggers")
        blocking = strs("blocking")
        zones = strs("zones")
        consent = strs("consent")
        patterns = strs("patterns")
        sourcePath = str("sourcePath")
        priority = try? c.decodeIfPresent(Int.self, forKey: .init("priority"))
        value = str("value")
        key = str("key")
        event = str("event")
        selector = str("selector")

        var rest: [String: JSONValue] = [:]
        for k in c.allKeys where !Asset.knownKeys.contains(k.stringValue) {
            rest[k.stringValue] = try? c.decode(JSONValue.self, forKey: k)
        }
        extra = rest
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: DynamicKey.self)
        try c.encode(id, forKey: .init("id"))
        try c.encode(name, forKey: .init("name"))
        try c.encodeIfPresent(type, forKey: .init("type"))
        try c.encodeIfPresent(description, forKey: .init("description"))
        try c.encodeIfPresent(code, forKey: .init("code"))
        if !triggers.isEmpty { try c.encode(triggers, forKey: .init("triggers")) }
        if !blocking.isEmpty { try c.encode(blocking, forKey: .init("blocking")) }
        if !zones.isEmpty { try c.encode(zones, forKey: .init("zones")) }
        if !consent.isEmpty { try c.encode(consent, forKey: .init("consent")) }
        if !patterns.isEmpty { try c.encode(patterns, forKey: .init("patterns")) }
        try c.encodeIfPresent(priority, forKey: .init("priority"))
        try c.encodeIfPresent(value, forKey: .init("value"))
        try c.encodeIfPresent(key, forKey: .init("key"))
        try c.encodeIfPresent(event, forKey: .init("event"))
        try c.encodeIfPresent(selector, forKey: .init("selector"))
        for (k, v) in extra { try c.encode(v, forKey: .init(k)) }
    }
}

struct ProjectData: Codable {
    var tags: [Asset] = []
    var triggers: [Asset] = []
    var variables: [Asset] = []
    var zones: [Asset] = []
    var errors: [JSONValue] = []
    var warnings: [JSONValue] = []

    func assets(_ kind: AssetKind) -> [Asset] {
        switch kind {
        case .tags: return tags
        case .triggers: return triggers
        case .variables: return variables
        case .zones: return zones
        }
    }
}

// MARK: - Settings

struct ProjectSettings: Codable {
    var containerId: String?
    var containerName: String?
    var path: String?
}

struct CloudflareSettings: Codable {
    var accountId: String?
    var apiToken: String?
}

struct AISettings: Codable {
    var provider: String?
    var anthropicApiKey: String?
    var openaiApiKey: String?
}

struct AppSettings: Codable {
    var project: ProjectSettings?
    var cloudflare: CloudflareSettings?
    var ai: AISettings?
    var recentProjects: [String]?
}

// MARK: - Deploy / RUM

struct DeploymentInfo: Codable {
    var deployed: Bool?
    var workerUrl: String?
    var workerName: String?
    var deployedAt: String?
    var message: String?
    var error: String?
}

struct RUMStatus: Codable {
    var success: Bool?
    var enabled: Bool?
    var sampleRate: Double?
    var workerUrl: String?
    var error: String?
}

// MARK: - Preview telemetry

struct TelemetryEvent: Codable, Identifiable, Hashable {
    var id: String
    var type: String?
    var containerId: String?
    var tagId: String?
    var tagName: String?
    var timestamp: Double?
    var latency: Double?
    var success: Bool?
    var error: String?
    var zone: String?
    var trigger: String?
    var pageUrl: String?
    var status: String?

    var date: Date { Date(timeIntervalSince1970: (timestamp ?? 0) / 1000) }
    var displayName: String { tagName ?? tagId ?? "unknown" }

    /// A consent-blocked tag never executed — it's a third state, not a failure.
    /// Some runtimes send `status: "blocked"`; older ones only send an error
    /// string, so fall back to detecting that.
    var isBlocked: Bool {
        if let s = status, s == "blocked" { return true }
        return success == false && (error ?? "").lowercased().contains("consent")
    }

    /// Worker (RUM) events carry no `id` — the Durable Object stores raw
    /// beacons. Synthesize a stable one so SwiftUI can diff and we can dedupe
    /// across polls.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try? c.decodeIfPresent(String.self, forKey: .type)
        containerId = try? c.decodeIfPresent(String.self, forKey: .containerId)
        tagId = try? c.decodeIfPresent(String.self, forKey: .tagId)
        tagName = try? c.decodeIfPresent(String.self, forKey: .tagName)
        timestamp = try? c.decodeIfPresent(Double.self, forKey: .timestamp)
        latency = try? c.decodeIfPresent(Double.self, forKey: .latency)
        success = try? c.decodeIfPresent(Bool.self, forKey: .success)
        error = try? c.decodeIfPresent(String.self, forKey: .error)
        zone = try? c.decodeIfPresent(String.self, forKey: .zone)
        trigger = try? c.decodeIfPresent(String.self, forKey: .trigger)
        pageUrl = try? c.decodeIfPresent(String.self, forKey: .pageUrl)
        status = try? c.decodeIfPresent(String.self, forKey: .status)

        if let existing = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? nil, !existing.isEmpty {
            id = existing
        } else {
            id = "\(tagId ?? "?")-\(Int(timestamp ?? 0))-\(Int((latency ?? 0) * 1000))"
        }
    }
}

/// Where the Preview screen reads telemetry from.
enum TelemetrySource: String, CaseIterable, Identifiable {
    case local, worker
    var id: String { rawValue }
    var title: String { self == .local ? "This Mac" : "Worker (live site)" }
    var help: String {
        self == .local
            ? "Streams from the local engine — for pages that can reach localhost."
            : "Polls the deployed Cloudflare Worker — for a hosted site like dev.yoursite.com."
    }
}

struct DevServerStatus: Codable {
    var running: Bool
    var port: Int?
    var projectPath: String?
    var isValidProject: Bool?
    var recentOutput: [String]?
}

// MARK: - Import / clear

struct ImportCounts: Codable {
    var tags: Int?
    var triggers: Int?
    var variables: Int?
    var zones: Int?
}

struct ImportResult: Codable {
    var success: Bool?
    var imported: ImportCounts?
    var skipped: ImportCounts?
    var errors: [String]?
    var warnings: [String]?
    var error: String?
}

struct ClearResult: Codable {
    var success: Bool?
    var total: Int?
    var backupPath: String?
    var error: String?
}

/// Locally-parsed summary of a GTM export, shown before importing.
struct GTMPreview {
    var containerId: String
    var containerName: String
    var tags: Int
    var triggers: Int
    var variables: Int
    var builtInVariables: Int
    var tagTypes: [(String, Int)]
    var fileName: String
    var rawJSON: String
}

// MARK: - WordPress sites

/// A WordPress install this container publishes to. Mirrors the engine's
/// `WordPressSite` record (snake_case on the wire).
struct WordPressSite: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var url: String
    var apiUrl: String
    var containerId: String
    var environment: String
    var lastSync: String
    var bundleVersion: String
    var status: String
    var wordpressVersion: String
    var phpVersion: String
    var woocommerce: Bool

    enum CodingKeys: String, CodingKey {
        case id, name, url, status, woocommerce
        case apiUrl = "api_url"
        case containerId = "container_id"
        case environment
        case lastSync = "last_sync"
        case bundleVersion = "bundle_version"
        case wordpressVersion = "wordpress_version"
        case phpVersion = "php_version"
    }

    // Every field except id/url is optional in practice — a site registered
    // before a plugin upgrade may not report php/wp versions.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        url = try c.decodeIfPresent(String.self, forKey: .url) ?? ""
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? url
        apiUrl = try c.decodeIfPresent(String.self, forKey: .apiUrl) ?? ""
        containerId = try c.decodeIfPresent(String.self, forKey: .containerId) ?? ""
        environment = try c.decodeIfPresent(String.self, forKey: .environment) ?? "staging"
        lastSync = try c.decodeIfPresent(String.self, forKey: .lastSync) ?? ""
        bundleVersion = try c.decodeIfPresent(String.self, forKey: .bundleVersion) ?? ""
        status = try c.decodeIfPresent(String.self, forKey: .status) ?? "disconnected"
        wordpressVersion = try c.decodeIfPresent(String.self, forKey: .wordpressVersion) ?? ""
        phpVersion = try c.decodeIfPresent(String.self, forKey: .phpVersion) ?? ""
        woocommerce = try c.decodeIfPresent(Bool.self, forKey: .woocommerce) ?? false
    }

    var isConnected: Bool { status == "connected" }

    var host: String { URL(string: url)?.host ?? url }
}

struct WPSitesResponse: Codable {
    var sites: [WordPressSite]?
    var error: String?
}

struct WPSiteResponse: Codable {
    var site: WordPressSite?
    var error: String?
    /// Present with HTTP 409 when the URL is already registered.
    var existingSiteId: String?

    enum CodingKeys: String, CodingKey {
        case site, error
        case existingSiteId = "existing_site_id"
    }
}

struct WPSyncResult: Codable {
    var success: Bool?
    var error: String?
    var version: String?
    var environment: String?
    var syncedAt: String?
    var bundlesCount: Int?
    var totalSize: Int?

    enum CodingKeys: String, CodingKey {
        case success, error, version, environment
        case syncedAt = "synced_at"
        case bundlesCount = "bundles_count"
        case totalSize = "total_size"
    }
}

// MARK: - Generic API envelope

struct APIResult: Codable {
    var success: Bool?
    var error: String?
    var message: String?
    var id: String?
}
