import Foundation
import JavaScriptCore

/// Reads a container's assets natively: esbuild bundles the TypeScript, and
/// JavaScriptCore evaluates it. No Node, no `next dev`.
///
/// The engine does the same job by esbuilding each file separately, then
/// *regex-stripping* the `@yourtm/*` import statements and pasting identity
/// shims over them (`packages/cli/src/compiler/index.ts`). That breaks on any
/// import esbuild has rewritten or that spans lines. Here the shims are a real
/// module aliased in at bundle time, so esbuild resolves them properly and no
/// text surgery is involved — and one bundle covers the whole container instead
/// of one subprocess per file.
enum NativeProjectReader {

    enum ReadError: LocalizedError {
        case noProject
        case bundle(String)
        case evaluate(String)
        case decode(String)

        var errorDescription: String? {
            switch self {
            case .noProject:        return "No project is open."
            case .bundle(let m):    return "Could not compile the container: \(m)"
            case .evaluate(let m):  return "Container evaluation failed: \(m)"
            case .decode(let m):    return "Unexpected container shape: \(m)"
            }
        }
    }

    /// Identity shims for every `define*` in @yourtm/core. esbuild needs real
    /// named exports to resolve against, so these are enumerated rather than
    /// proxied. The specialised variable helpers stamp a `type`, matching the
    /// shims the engine injects.
    static let stubSource = """
    const identity = (v) => v;
    const typed = (t) => (v) => ({ ...v, type: v.type ?? t });

    export const defineTag = identity;
    export const defineAsyncTag = identity;
    export const defineOnceTag = identity;
    export const defineTrigger = identity;
    export const defineZone = identity;
    export const defineConfig = identity;
    export const defineVariable = identity;

    export const definePageviewTrigger = typed('pageview');
    export const defineClickTrigger = typed('click');
    export const defineScrollTrigger = typed('scroll');
    export const defineTimerTrigger = typed('timer');
    export const defineVisibilityTrigger = typed('visibility');
    export const defineFormSubmitTrigger = typed('formSubmit');
    export const defineHistoryChangeTrigger = typed('historyChange');
    export const defineDataLayerEventTrigger = typed('customEvent');
    export const defineCustomEventTrigger = typed('customEvent');
    export const defineInitTrigger = typed('init');
    export const defineYouTubeVideoTrigger = typed('youtube');
    export const defineCustomTrigger = typed('custom');

    export const defineDataLayerVariable = typed('dataLayer');
    export const defineComputedVariable = typed('computed');
    export const defineCookieVariable = typed('cookie');
    export const defineFirstPartyCookieVariable = typed('firstPartyCookie');
    export const defineURLVariable = typed('url');
    export const defineLocalStorageVariable = typed('localStorage');
    export const defineSessionStorageVariable = typed('sessionStorage');
    export const defineDOMElementVariable = typed('domElement');
    export const defineJavaScriptVariable = typed('javascript');
    export const defineConstantVariable = typed('constant');
    export const defineCustomVariable = typed('custom');

    export const defineAllPagesZone = identity;
    export const defineBlogZone = identity;
    export const defineProductZone = identity;
    export const defineCategoryZone = identity;
    export const defineCheckoutZone = identity;
    export const defineAccountZone = identity;
    export const defineAdminZone = identity;
    export const defineHomepageZone = identity;
    export const defineSearchZone = identity;
    """

    private static let kinds: [AssetKind] = [.tags, .triggers, .variables, .zones]

    /// Every `.ts`/`.js` asset under `yourtm/<kind>/`, recursively.
    static func assetFiles(projectPath: String, kind: AssetKind) -> [URL] {
        let dir = URL(fileURLWithPath: projectPath).appendingPathComponent("yourtm/\(kind.rawValue)")
        guard let e = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return e.compactMap { $0 as? URL }
            .filter { ["ts", "js"].contains($0.pathExtension) }
            .sorted { $0.path < $1.path }
    }

    static func read(projectPath: String) async throws -> ProjectData {
        guard !projectPath.isEmpty else { throw ReadError.noProject }

        let work = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("ytm-read-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: work) }

        let stub = work.appendingPathComponent("yourtm-core-stub.js")
        try stubSource.write(to: stub, atomically: true, encoding: .utf8)

        // One entry point importing every asset, so a single bundle covers the
        // container. `sourcePath` is captured here because it is knowable at
        // build time and the engine only reports it for tags.
        var imports: [String] = []
        var entries: [String: [String]] = [:]
        var index = 0
        for kind in kinds {
            var rows: [String] = []
            for file in assetFiles(projectPath: projectPath, kind: kind) {
                let alias = "m\(index)"
                index += 1
                imports.append("import * as \(alias) from \(jsString(file.path))")
                let rel = file.path.replacingOccurrences(of: projectPath + "/", with: "")
                rows.append("{ mod: \(alias), sourcePath: \(jsString(rel)) }")
            }
            entries[kind.rawValue] = rows
        }

        let entrySource = """
        \(imports.joined(separator: "\n"))

        const slug = (s) => String(s).toLowerCase()
          .replace(/\\s+/g, '-').replace(/[^a-z0-9-_]/g, '');

        // A module may default-export one definition or an array of them, and
        // may also use named exports. Mirror the engine on all three.
        function collect(entry) {
          const out = [];
          const take = (def) => {
            if (!def || typeof def !== 'object') return;
            if (!def.id && !def.name) return;
            const copy = { ...def };
            if (!copy.id) copy.id = slug(copy.name);
            copy.sourcePath = entry.sourcePath;
            out.push(copy);
          };
          const mod = entry.mod;
          if (Array.isArray(mod.default)) mod.default.forEach(take);
          else if (mod.default) take(mod.default);
          for (const [k, v] of Object.entries(mod)) if (k !== 'default') take(v);
          return out;
        }

        globalThis.YTM_PROJECT = JSON.stringify({
        \(kinds.map { "  \($0.rawValue): [\(entries[$0.rawValue]!.joined(separator: ", "))].flatMap(collect)" }
              .joined(separator: ",\n")),
          // A file that fails to parse stops the bundle, so anything reaching
          // here compiled. Kept so the payload matches the engine's shape.
          errors: [],
          warnings: []
        }, (key, value) => (typeof value === 'function' ? undefined : value));
        """
        let entry = work.appendingPathComponent("entry.mjs")
        try entrySource.write(to: entry, atomically: true, encoding: .utf8)

        let compiler = NativeCompiler()
        let bundled: NativeCompiler.Result
        do {
            bundled = try await compiler.bundle(
                entry: entry,
                alias: ["@yourtm/core": stub.path,
                        "@yourtm/vendors": stub.path,
                        "@yourtm/runtime": stub.path],
                minify: false
            )
        } catch {
            throw ReadError.bundle(error.localizedDescription)
        }

        let ctx = JSContext()!
        var thrown: String?
        ctx.exceptionHandler = { _, exc in thrown = exc?.toString() ?? "unknown JS exception" }
        ctx.evaluateScript(bundled.code)
        if let thrown { throw ReadError.evaluate(thrown) }

        guard let json = ctx.objectForKeyedSubscript("YTM_PROJECT")?.toString(),
              let data = json.data(using: .utf8) else {
            throw ReadError.evaluate("container produced no output")
        }
        do {
            return try JSONDecoder().decode(ProjectData.self, from: data)
        } catch {
            throw ReadError.decode("\(error)")
        }
    }

    /// JSON string literal — safe to paste into generated JavaScript.
    static func jsString(_ s: String) -> String {
        (try? String(data: JSONSerialization.data(withJSONObject: [s], options: .fragmentsAllowed),
                     encoding: .utf8))
            .map { String($0.dropFirst().dropLast()) } ?? "\"\(s)\""
    }
}
