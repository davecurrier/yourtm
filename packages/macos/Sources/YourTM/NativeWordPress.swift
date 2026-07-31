import Foundation

/// The WordPress publish path, natively.
///
/// Sites live under `wordpress.sites` in `~/.yourtm/config.json`, and pushing a
/// bundle is a compile plus one POST to the plugin's `/sync`. Nothing here
/// needs a Node process.
enum NativeWordPress {

    // MARK: Errors

    enum WPError: LocalizedError {
        case unreachable(String)
        case badKey(String)
        case noPlugin(String)
        case rejected(String)
        case duplicate(String)

        var errorDescription: String? {
            switch self {
            case .unreachable(let host):
                return "Could not reach \(host). Check the URL and that the site is online."
            case .badKey(let host):
                return "Invalid API key for \(host). Copy the key from Settings → YourTM Tag Manager on that site."
            case .noPlugin(let host):
                return "No YourTM plugin responding at \(host). Install and activate the plugin, then try again."
            case .rejected(let m): return m
            case .duplicate(let host): return "\(host) is already connected."
            }
        }
    }

    /// Turn a failed plugin response into something worth showing.
    ///
    /// The raw body is useless in a dialog: a wrong key returns a WP_Error JSON
    /// envelope and a site without the plugin returns a whole HTML page.
    private static func describe(status: Int, body: Data, host: String) -> WPError {
        if status == 401 || status == 403 { return .badKey(host) }
        if status == 404 || status == 405 { return .noPlugin(host) }
        if let object = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any],
           let message = object["message"] as? String {
            return .rejected("\(host): \(message)")
        }
        let text = String(data: body, encoding: .utf8) ?? ""
        // Never echo HTML back into the UI.
        let snippet = text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<")
            ? "" : " \(text.prefix(120))"
        return .rejected("\(host) returned HTTP \(status).\(snippet)")
    }

    private static func host(of url: String) -> String { URL(string: url)?.host ?? url }

    /// `https://example.com` from anything the user might type.
    static func normalize(_ raw: String) -> String {
        let t = raw.trimmingCharacters(in: .whitespaces)
        let withScheme = (t.hasPrefix("http://") || t.hasPrefix("https://")) ? t : "https://" + t
        return withScheme.hasSuffix("/") ? String(withScheme.dropLast()) : withScheme
    }

    private static func call(
        _ url: String, method: String = "GET", apiKey: String, body: Data? = nil
    ) async throws -> Data {
        var req = URLRequest(url: URL(string: url)!)
        req.httpMethod = method
        req.timeoutInterval = 60
        req.setValue(apiKey, forHTTPHeaderField: "X-YourTM-Key")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body

        let (data, response): (Data, URLResponse)
        do { (data, response) = try await URLSession.shared.data(for: req) }
        catch { throw WPError.unreachable(host(of: url)) }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw describe(status: status, body: data, host: host(of: url))
        }
        return data
    }

    // MARK: Site registry

    static func sites() -> [WordPressSite] {
        guard let data = try? Data(contentsOf: NativeSettings.configURL),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let wp = root["wordpress"] as? [String: Any],
              let rows = wp["sites"] as? [[String: Any]],
              let encoded = try? JSONSerialization.data(withJSONObject: rows)
        else { return [] }
        return (try? JSONDecoder().decode([WordPressSite].self, from: encoded)) ?? []
    }

    /// Rewrite `wordpress.sites`, leaving every other key untouched.
    private static func writeSites(_ rows: [[String: Any]]) {
        guard let data = try? Data(contentsOf: NativeSettings.configURL),
              var root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return }
        var wp = (root["wordpress"] as? [String: Any]) ?? [:]
        wp["sites"] = rows
        root["wordpress"] = wp
        if let out = try? JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted]) {
            try? out.write(to: NativeSettings.configURL, options: .atomic)
        }
    }

    private static func rawSites() -> [[String: Any]] {
        guard let data = try? Data(contentsOf: NativeSettings.configURL),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let wp = root["wordpress"] as? [String: Any]
        else { return [] }
        return (wp["sites"] as? [[String: Any]]) ?? []
    }

    /// The plugin stores the key; it is never displayed, only sent.
    private static func apiKey(for id: String) -> String? {
        rawSites().first { $0["id"] as? String == id }?["api_key"] as? String
    }

    // MARK: Operations

    /// Probe a site without registering it.
    static func test(url: String, apiKey key: String) async -> String {
        let site = normalize(url)
        do {
            _ = try await call("\(site)/wp-json/yourtm/v1/verify", method: "POST", apiKey: key)
            return "Connection successful. The plugin is active and responding."
        } catch {
            return error.localizedDescription
        }
    }

    static func addSite(url: String, apiKey key: String, containerId: String,
                        environment: String) async throws -> WordPressSite {
        let site = normalize(url)
        let apiURL = "\(site)/wp-json/yourtm/v1"

        if rawSites().contains(where: { ($0["url"] as? String).map(normalize) == site }) {
            throw WPError.duplicate(host(of: site))
        }

        _ = try await call("\(apiURL)/verify", method: "POST", apiKey: key)
        let infoData = try await call("\(apiURL)/site-info", apiKey: key)
        let info = ((try? JSONSerialization.jsonObject(with: infoData)) as? [String: Any]) ?? [:]
        let plugin = info["plugin_info"] as? [String: Any] ?? [:]

        let row: [String: Any] = [
            "id": UUID().uuidString,
            "name": info["home_url"] as? String ?? host(of: site),
            "url": site,
            "api_url": apiURL,
            "api_key": key,
            "container_id": containerId,
            "environment": environment,
            "last_sync": "",
            "bundle_version": "",
            "status": "connected",
            "wordpress_version": plugin["wordpress_version"] as? String ?? "",
            "php_version": plugin["php_version"] as? String ?? "",
            "woocommerce": info["woocommerce"] as? Bool ?? false,
        ]
        writeSites(rawSites() + [row])

        let encoded = try JSONSerialization.data(withJSONObject: row)
        return try JSONDecoder().decode(WordPressSite.self, from: encoded)
    }

    static func removeSite(id: String) {
        writeSites(rawSites().filter { $0["id"] as? String != id })
    }

    struct SyncResult { var version: String; var bundles: Int; var totalSize: Int }

    /// Compile the container and push it to one site.
    static func sync(site: WordPressSite, projectPath: String,
                     containerId: String) async throws -> SyncResult {
        guard let key = apiKey(for: site.id) else { throw WPError.badKey(site.host) }

        let bundles = try await NativeBuilder.buildAll(
            projectPath: projectPath, containerId: containerId, minify: true
        )
        let payloadBundles: [[String: Any]] = bundles.map { b in
            [
                "name": b.name,
                "code": b.code,
                "hash": b.code.data(using: .utf8)!.sha256Hex,
                "size": b.size,
                "gzip_size": b.code.data(using: .utf8)!.deflatedSize,
            ]
        }
        let version = payloadBundles
            .compactMap { $0["hash"] as? String }
            .joined()
            .data(using: .utf8)!
            .sha256Hex
            .prefix(12)

        let payload: [String: Any] = [
            "container_id": containerId,
            "version": String(version),
            "environment": site.environment,
            "compiled_at": ISO8601DateFormatter().string(from: Date()),
            "bundles": payloadBundles,
            "config": ["container_id": containerId, "environment": site.environment,
                       "consent": [:], "telemetry": [:]],
        ]
        _ = try await call("\(site.apiUrl)/sync", method: "POST", apiKey: key,
                           body: try JSONSerialization.data(withJSONObject: payload))

        // Record what was pushed, merging rather than replacing the row.
        var rows = rawSites()
        if let i = rows.firstIndex(where: { $0["id"] as? String == site.id }) {
            rows[i]["last_sync"] = ISO8601DateFormatter().string(from: Date())
            rows[i]["bundle_version"] = String(version)
            rows[i]["status"] = "connected"
            writeSites(rows)
        }
        return SyncResult(version: String(version), bundles: bundles.count,
                          totalSize: bundles.reduce(0) { $0 + $1.size })
    }

    /// `refresh` / `purge_cache` on the plugin.
    static func action(site: WordPressSite, _ name: String) async throws -> String {
        guard let key = apiKey(for: site.id) else { throw WPError.badKey(site.host) }
        let path = name == "purge_cache" ? "purge-cache" : name
        let data = try await call("\(site.apiUrl)/\(path)", method: "POST", apiKey: key)
        let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return object?["message"] as? String ?? "Done"
    }
}

// MARK: - Hashing and compressed size

import Compression
import CryptoKit

extension Data {
    /// SHA-256, lowercase hex — the shape the plugin's sync payload expects.
    var sha256Hex: String {
        SHA256.hash(data: self).map { String(format: "%02x", $0) }.joined()
    }

    /// Deflated size, used for the plugin's dashboard readout.
    ///
    /// zlib rather than true gzip: the payload differs only by an 18-byte
    /// header and trailer, which is immaterial for a size display and avoids
    /// hand-rolling a gzip container. Returns the raw size if compression
    /// fails, so a bad number never reads as zero.
    var deflatedSize: Int {
        guard !isEmpty else { return 0 }
        let capacity = count + 64
        let out = UnsafeMutablePointer<UInt8>.allocate(capacity: capacity)
        defer { out.deallocate() }
        let written = withUnsafeBytes { raw -> Int in
            guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return 0 }
            return compression_encode_buffer(out, capacity, base, count, nil, COMPRESSION_ZLIB)
        }
        return written > 0 ? written : count
    }
}
