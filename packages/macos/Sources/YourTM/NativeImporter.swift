import Foundation
import JavaScriptCore

/// GTM import, natively.
///
/// The generators run in JavaScriptCore — several hundred lines of string
/// templating plus the vendor detectors that recognise sixteen GTM tag types.
/// Rewriting that in Swift would duplicate logic whose failure mode is a file
/// that looks right and does not compile. Swift keeps what Swift is good at:
/// deciding where files land and putting them there.
enum NativeImporter {

    struct File {
        var kind: AssetKind
        var filename: String
        var content: String
    }

    struct Result {
        var files: [File]
        var warnings: [String]
        var skipped: [String: Int]
        var containerId: String
        var containerName: String

        var counts: [AssetKind: Int] {
            Dictionary(grouping: files, by: \.kind).mapValues(\.count)
        }
    }

    enum ImportError: LocalizedError {
        case resourceMissing
        case load(String)
        case failed(String)
        case write(String)

        var errorDescription: String? {
            switch self {
            case .resourceMissing:
                return "ytm-gtm-import.js is missing from the app bundle. Run scripts/build-js-runtime.sh."
            case .load(let m):   return "Importer failed to load: \(m)"
            case .failed(let m): return m
            case .write(let m):  return "Could not write the imported files: \(m)"
            }
        }
    }

    /// Parse a GTM export and produce the files it implies, writing nothing.
    static func plan(gtmJSON: String) throws -> Result {
        guard let url = Bundle.main.url(forResource: "ytm-gtm-import", withExtension: "js")
                ?? ScriptRuntime.developmentResourceURL(named: "ytm-gtm-import.js") else {
            throw ImportError.resourceMissing
        }

        let ctx = JSContext()!
        var thrown: String?
        ctx.exceptionHandler = { _, exc in thrown = exc?.toString() ?? "unknown JS exception" }
        ctx.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        if let thrown { throw ImportError.load(thrown) }

        // Synchronous on purpose. The engine's version was async only because
        // it reached the vendor detectors through a dynamic import; esbuild
        // inlines them here, so there is no promise to unwrap — and unwrapping
        // one in JavaScriptCore means pumping a run loop from a worker thread.
        guard let fn = ctx.objectForKeyedSubscript("ytmImportGTM"),
              let value = fn.call(withArguments: [gtmJSON]), value.isString else {
            throw ImportError.failed(thrown ?? "importer produced no result")
        }
        if let thrown { throw ImportError.failed(thrown) }
        let json = value.toString() ?? ""

        guard let data = json.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
            throw ImportError.failed("importer returned an unreadable result")
        }
        if let error = object["error"] as? String { throw ImportError.failed(error) }

        let rows = (object["files"] as? [[String: Any]]) ?? []
        let files: [File] = rows.compactMap { r in
            guard let kindRaw = r["kind"] as? String, let kind = AssetKind(rawValue: kindRaw),
                  let name = r["filename"] as? String, let content = r["content"] as? String
            else { return nil }
            return File(kind: kind, filename: name, content: content)
        }
        return Result(
            files: files,
            warnings: (object["warnings"] as? [String]) ?? [],
            skipped: (object["skipped"] as? [String: Int]) ?? [:],
            containerId: object["containerId"] as? String ?? "",
            containerName: object["containerName"] as? String ?? ""
        )
    }

    struct Cleared {
        var counts: [AssetKind: Int]
        var total: Int
        var backupPath: String
    }

    /// Empty the asset directories an import repopulates, backing the whole
    /// tree up first.
    ///
    /// Destructive and usually run mid-migration, so the backup is not optional
    /// and its path is returned for the UI to show.
    ///
    /// Zones are left alone. GTM has no zones, so an import never writes any:
    /// clearing them deleted a container's hand-written zones with nothing to
    /// replace them, and every tag silently fell back to the unzoned bundle.
    static let clearedKinds: [AssetKind] = AssetKind.allCases.filter { $0 != .zones }

    static func clear(projectPath: String) throws -> Cleared {
        guard !projectPath.isEmpty else { throw ImportError.write("no project is open") }
        let fm = FileManager.default
        let root = URL(fileURLWithPath: projectPath).standardizedFileURL
        let yourtm = root.appendingPathComponent("yourtm")
        guard fm.fileExists(atPath: yourtm.path) else {
            throw ImportError.write("no yourtm/ directory in this project")
        }

        var counts: [AssetKind: Int] = [:]
        var sources: [AssetKind: [URL]] = [:]
        for kind in clearedKinds {
            let dir = yourtm.appendingPathComponent(kind.rawValue)
            let files = ((try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? [])
                .filter { $0.pathExtension == "ts" }
            counts[kind] = files.count
            sources[kind] = files
        }

        // Timestamp to the second, colons and dots swapped out — this becomes a
        // directory name, and `:` is still a path separator to parts of macOS.
        let stamp = ISO8601DateFormatter().string(from: Date())
            .replacingOccurrences(of: ":", with: "-")
            .replacingOccurrences(of: ".", with: "-")
        let backup = root.appendingPathComponent(".yourtm-backups").appendingPathComponent(stamp)
        do {
            try fm.createDirectory(at: backup.deletingLastPathComponent(),
                                   withIntermediateDirectories: true)
            try fm.copyItem(at: yourtm, to: backup)
        } catch {
            throw ImportError.write("backup failed, nothing was deleted: \(error.localizedDescription)")
        }

        // Only now, with the backup on disk, remove anything.
        for (kind, files) in sources {
            let dir = yourtm.appendingPathComponent(kind.rawValue)
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
            for file in files { try? fm.removeItem(at: file) }
        }

        return Cleared(
            counts: counts,
            total: counts.values.reduce(0, +),
            backupPath: ".yourtm-backups/\(stamp)"
        )
    }

    /// Write a planned import into the project.
    @discardableResult
    static func write(_ result: Result, projectPath: String) throws -> Int {
        guard !projectPath.isEmpty else { throw ImportError.write("no project is open") }
        let root = URL(fileURLWithPath: projectPath)
        var written = 0
        for file in result.files {
            let dir = root.appendingPathComponent("yourtm/\(file.kind.rawValue)")
            do {
                try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try file.content.write(to: dir.appendingPathComponent(file.filename),
                                       atomically: true, encoding: .utf8)
                written += 1
            } catch {
                throw ImportError.write("\(file.kind.rawValue)/\(file.filename): \(error.localizedDescription)")
            }
        }
        return written
    }
}
