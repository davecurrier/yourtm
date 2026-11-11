import Foundation

/// Reads app settings straight from `~/.yourtm/config.json`.
///
/// `GET /api/settings` does exactly this plus two regexes over the project's
/// `yourtm.config.ts`, so routing it through a Node process was never buying
/// anything. Taking it native matters more than its size suggests: the project
/// path lives here, and the container reader needs that path, so as long as
/// settings required the engine the whole read path did too.
enum NativeSettings {

    static var configURL: URL {
        URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".yourtm/config.json")
    }

    /// Nil when there is no config yet — a first run, not an error.
    static func load() -> AppSettings? {
        guard let data = try? Data(contentsOf: configURL),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        else { return nil }

        var settings = AppSettings()

        let projectPath = root["currentProject"] as? String ?? ""
        var project = ProjectSettings()
        project.path = projectPath
        if !projectPath.isEmpty {
            let (id, name) = containerIdentity(projectPath: projectPath)
            project.containerId = id
            project.containerName = name
        }
        settings.project = project

        if let cf = root["cloudflare"] as? [String: Any] {
            settings.cloudflare = CloudflareSettings(
                accountId: cf["accountId"] as? String,
                apiToken: cf["apiToken"] as? String
            )
        }
        if let ai = root["ai"] as? [String: Any] {
            settings.ai = AISettings(
                provider: ai["provider"] as? String,
                anthropicApiKey: ai["anthropicApiKey"] as? String,
                openaiApiKey: ai["openaiApiKey"] as? String
            )
        }
        // Drop recents whose directory has since been deleted, as the engine
        // does — otherwise the menu offers projects that cannot be opened.
        settings.recentProjects = (root["recentProjects"] as? [String])?
            .filter { FileManager.default.fileExists(atPath: $0) }
        return settings
    }

    /// Per-project deployment record from `~/.yourtm/config.json`.
    ///
    /// The engine keeps this under `deployments` keyed by absolute project
    /// path, and it is where the RUM toggle's current state is remembered.
    static func deployment(projectPath: String) -> [String: Any]? {
        guard !projectPath.isEmpty,
              let data = try? Data(contentsOf: configURL),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let all = root["deployments"] as? [String: Any] else { return nil }
        return all[projectPath] as? [String: Any]
    }

    /// Merge keys into the project's deployment record, preserving the rest.
    static func updateDeployment(projectPath: String, _ updates: [String: Any]) {
        guard !projectPath.isEmpty else { return }
        try? mutate { root in
            var all = (root["deployments"] as? [String: Any]) ?? [:]
            var entry = (all[projectPath] as? [String: Any]) ?? [:]
            for (k, v) in updates { entry[k] = v }
            all[projectPath] = entry
            root["deployments"] = all
        }
    }

    /// The Deploy screen's summary of the last deployment, as the engine's
    /// `GET /api/project/deployment` reported it.
    static func deploymentInfo(projectPath: String) -> DeploymentInfo {
        guard let d = deployment(projectPath: projectPath), d["workerName"] != nil || d["workerUrl"] != nil else {
            return DeploymentInfo(deployed: false, message: "No deployment found for current project")
        }
        return DeploymentInfo(deployed: true,
                              workerUrl: d["workerUrl"] as? String,
                              workerName: d["workerName"] as? String,
                              deployedAt: d["deployedAt"] as? String)
    }

    // MARK: Writing

    enum SettingsError: LocalizedError {
        case notAProject(String)
        var errorDescription: String? {
            switch self {
            case .notAProject(let p): return "Not a YourTM project (no yourtm.config.ts): \(p)"
            }
        }
    }

    static func isValidProject(_ path: String) -> Bool {
        FileManager.default.fileExists(atPath: (path as NSString).appendingPathComponent("yourtm.config.ts"))
    }

    /// Make `path` the current project and move it to the front of the recents
    /// (ten kept), as `POST /api/settings/project` did.
    static func setProject(path: String) throws {
        let normalized = URL(fileURLWithPath: path).standardizedFileURL.path
        guard isValidProject(normalized) else { throw SettingsError.notAProject(normalized) }
        try mutate { root in
            root["currentProject"] = normalized
            let recent = (root["recentProjects"] as? [String] ?? []).filter { $0 != normalized }
            root["recentProjects"] = Array(([normalized] + recent).prefix(10))
        }
    }

    /// Merge Cloudflare and AI credentials into the config, as
    /// `POST /api/settings` did: given keys overwrite, empty values are
    /// dropped, and every other key in the file is preserved.
    static func save(cloudflare: [String: Any], ai: [String: Any]) throws {
        try mutate { root in
            for (section, updates) in [("cloudflare", cloudflare), ("ai", ai)] where !updates.isEmpty {
                var merged = (root[section] as? [String: Any]) ?? [:]
                for (k, v) in updates { merged[k] = v }
                merged = merged.filter { !(($0.value as? String)?.isEmpty ?? false) }
                root[section] = merged
            }
        }
    }

    /// Read-modify-write the whole config file. A missing file starts empty
    /// rather than failing — first run, or a config the installer used to
    /// delete — and the file is written 0600 because it holds API tokens.
    static func mutate(_ change: (inout [String: Any]) -> Void) throws {
        var root: [String: Any] = [:]
        if let data = try? Data(contentsOf: configURL),
           let parsed = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            root = parsed
        }
        change(&root)
        let fm = FileManager.default
        try fm.createDirectory(at: configURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let out = try JSONSerialization.data(withJSONObject: root, options: [.prettyPrinted, .sortedKeys])
        try out.write(to: configURL, options: .atomic)
        try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
    }

    /// Pull containerId / name out of `yourtm.config.ts`.
    ///
    /// Regex rather than evaluation, matching what the engine does: these are
    /// plain string literals, and running the container's config through
    /// esbuild + JavaScriptCore just to read two fields would cost far more
    /// than it returns.
    private static func containerIdentity(projectPath: String) -> (String?, String?) {
        let url = URL(fileURLWithPath: projectPath).appendingPathComponent("yourtm.config.ts")
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return (nil, nil) }
        return (firstMatch(in: text, #"containerId:\s*['"]([^'"]+)['"]"#),
                firstMatch(in: text, #"(?:containerName|name):\s*['"]([^'"]+)['"]"#))
    }

    private static func firstMatch(in text: String, _ pattern: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              m.numberOfRanges > 1,
              let r = Range(m.range(at: 1), in: text)
        else { return nil }
        return String(text[r])
    }
}
