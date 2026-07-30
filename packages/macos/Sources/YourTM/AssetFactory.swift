import Foundation

/// Writes new asset source files.
enum AssetFactory {

    enum FactoryError: LocalizedError {
        case noProject
        case exists(String)
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .noProject: return "No project is open."
            case .exists(let p): return "\(p) already exists."
            case .writeFailed(let m): return "Could not write the file: \(m)"
            }
        }
    }

    static func fileURL(kind: AssetKind, id: String, projectPath: String) -> URL? {
        guard !projectPath.isEmpty else { return nil }
        let url = URL(fileURLWithPath: projectPath)
            .appendingPathComponent("yourtm/\(kind.rawValue)/\(id).ts")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static let defineFn: [AssetKind: String] = [
        .tags: "defineTag", .triggers: "defineTrigger",
        .variables: "defineVariable", .zones: "defineZone",
    ]

    /// Single-quoted TS string literal, matching the style of the hand-written
    /// sources rather than the double quotes ts-morph emits on edit.
    private static func quoted(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "\\", with: "\\\\")
               .replacingOccurrences(of: "'", with: "\\'") + "'"
    }

    static func create(
        kind: AssetKind, id: String, name: String, description: String,
        type: String, key: String, value: String, code: String = "",
        patterns: [String], conditions: [[String: Any]] = [],
        projectPath: String
    ) throws {
        guard !projectPath.isEmpty else { throw FactoryError.noProject }
        let dir = URL(fileURLWithPath: projectPath)
            .appendingPathComponent("yourtm/\(kind.rawValue)")
        let file = dir.appendingPathComponent("\(id).ts")
        if FileManager.default.fileExists(atPath: file.path) {
            throw FactoryError.exists("yourtm/\(kind.rawValue)/\(id).ts")
        }

        var lines = ["  name: \(quoted(name))"]
        if kind == .triggers || kind == .variables, !type.isEmpty {
            lines.append("  type: \(quoted(type))")
        }
        if kind == .variables, type == "datalayer", !key.isEmpty {
            lines.append("  key: \(quoted(key))")
        }
        if kind == .variables, type == "constant" {
            lines.append("  value: \(quoted(value))")
        }
        if kind == .variables, type == "javascript", !code.isEmpty {
            // Template literal: the body is multi-line and may contain quotes.
            let escaped = code
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "`", with: "\\`")
                .replacingOccurrences(of: "${", with: "\\${")
            lines.append("  code: `\n\(escaped)\n  `")
        }
        if kind == .zones {
            let list = patterns.map(quoted).joined(separator: ", ")
            lines.append("  patterns: [\(list)]")
            lines.append("  priority: 10")
        }
        if !description.isEmpty {
            lines.append("  description: \(quoted(description))")
        }
        if !conditions.isEmpty {
            let rows = conditions.map { c -> String in
                var parts = ["variable: \(quoted(c["variable"] as? String ?? ""))",
                             "operator: \(quoted(c["operator"] as? String ?? "equals"))"]
                if let n = c["value"] as? Double {
                    parts.append("value: \(n == n.rounded() ? String(Int(n)) : String(n))")
                } else if let v = c["value"] as? String {
                    parts.append("value: \(quoted(v))")
                }
                return "    { \(parts.joined(separator: ", ")) }"
            }
            lines.append("  conditions: [\n\(rows.joined(separator: ",\n"))\n  ]")
        }

        let fn = defineFn[kind] ?? "defineTag"
        let source = """
        import { \(fn) } from '@yourtm/core'

        export default \(fn)({
        \(lines.joined(separator: ",\n")),
        })

        """

        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try source.write(to: file, atomically: true, encoding: .utf8)
        } catch {
            throw FactoryError.writeFailed(error.localizedDescription)
        }
    }
}
