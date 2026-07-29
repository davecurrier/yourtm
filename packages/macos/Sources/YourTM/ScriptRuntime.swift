import Foundation
import JavaScriptCore

/// Runs the JavaScript half of the engine inside JavaScriptCore.
///
/// Editing a container's TypeScript sources means parsing TypeScript, and the
/// only real TypeScript parser is the TypeScript compiler itself — there is no
/// Swift equivalent. Rather than keep Node alive for it, `ts-morph` is bundled
/// to a single file (`scripts/build-js-runtime.sh`) and executed in
/// JavaScriptCore, which ships with macOS. The bridge is strings in, strings
/// out, so the JS side never touches the filesystem.
///
/// Loading the bundle costs ~170 ms once; an edit is ~11 ms after that — well
/// under the HTTP round-trip to the Next.js engine it replaces.
actor ScriptRuntime {
    static let shared = ScriptRuntime()

    enum RuntimeError: LocalizedError {
        case resourceMissing
        case load(String)
        case call(String)
        case badResult(String)

        var errorDescription: String? {
            switch self {
            case .resourceMissing:
                return "ytm-script-runtime.js is missing from the app bundle. Run scripts/build-js-runtime.sh."
            case .load(let m):   return "Script runtime failed to load: \(m)"
            case .call(let m):   return "Script runtime error: \(m)"
            case .badResult(let m): return "Script runtime returned an unusable result: \(m)"
            }
        }
    }

    private var context: JSContext?

    /// Lazily create and populate the JS context. Cheap on every call but the first.
    private func ready() throws -> JSContext {
        if let context { return context }

        guard let url = Bundle.main.url(forResource: "ytm-script-runtime", withExtension: "js")
                ?? Self.developmentResourceURL(named: "ytm-script-runtime.js") else {
            throw RuntimeError.resourceMissing
        }

        let ctx = JSContext()!
        var thrown: String?
        ctx.exceptionHandler = { _, exc in thrown = exc?.toString() ?? "unknown JS exception" }
        ctx.evaluateScript(try String(contentsOf: url, encoding: .utf8))
        if let thrown { throw RuntimeError.load(thrown) }

        context = ctx
        return ctx
    }

    /// Apply property updates to the object literal of an asset's `define*()` call.
    /// Returns the rewritten file contents.
    func editAsset(source: String, assetId: String, updates: [String: Any]) throws -> String {
        let ctx = try ready()
        var thrown: String?
        ctx.exceptionHandler = { _, exc in thrown = exc?.toString() ?? "unknown JS exception" }

        let updatesJSON = String(
            data: try JSONSerialization.data(withJSONObject: updates),
            encoding: .utf8
        ) ?? "{}"

        guard let fn = ctx.objectForKeyedSubscript("ytmEditAsset"),
              let value = fn.call(withArguments: [source, assetId, updatesJSON]),
              let json = value.toString(),
              let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            throw RuntimeError.call(thrown ?? "no result from ytmEditAsset")
        }
        if let thrown { throw RuntimeError.call(thrown) }
        if let error = object["error"] as? String { throw RuntimeError.call(error) }
        guard let code = object["code"] as? String, !code.isEmpty else {
            throw RuntimeError.badResult("empty source returned for \(assetId)")
        }
        return code
    }

    /// `swift run` has no bundle resources; fall back to the source tree.
    nonisolated static func developmentResourceURL(named name: String) -> URL? {
        let candidate = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Resources/\(name)")
        return FileManager.default.fileExists(atPath: candidate.path) ? candidate : nil
    }
}
