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
