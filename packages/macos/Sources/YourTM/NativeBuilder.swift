import Foundation
import JavaScriptCore

/// Produces deployable bundles natively — the half of the compiler that emits
/// code, as opposed to NativeProjectReader which only reads definitions.
///
/// Two things make this different from reading, and both matter:
///
/// 1. **Functions must survive.** The reader drops them (they cannot be shown in
///    a form), but a variable's `compute` is the whole point of the variable.
///    The engine serialises them as `__FUNC_<source>__` strings and `eval`s them
///    back at runtime; that convention is reproduced exactly, because the
///    runtime's revival code looks for that literal prefix.
/// 2. **The entry point is generated, not read.** Bundle output is an IIFE that
///    calls `initYourTM(config)` with the triggers and variables inlined.
enum NativeBuilder {

    struct Bundle {
        var name: String
        var code: String
        var size: Int { code.utf8.count }
    }

    enum BuildError: LocalizedError {
        case noProject
        case runtimeNotFound([String])
        case bundle(String)
        case evaluate(String)

        var errorDescription: String? {
            switch self {
            case .noProject: return "No project is open."
            case .runtimeNotFound(let tried):
                return "@yourtm/runtime source not found. Looked in:\n"
                    + tried.prefix(6).map { "  \($0)" }.joined(separator: "\n")
            case .bundle(let m): return "Bundle failed: \(m)"
            case .evaluate(let m): return "Container evaluation failed: \(m)"
            }
        }
    }

    // MARK: Runtime resolution

    /// Mirrors `resolveRuntimeSource()` in the CLI compiler: walk up from the
    /// project looking for the runtime's TypeScript entry.
    static func resolveRuntimeSource(projectPath: String) throws -> String {
        var candidates: [String] = []
        let fm = FileManager.default

        func walkUp(from start: String) {
            var dir = start
            for _ in 0..<7 {
                candidates.append((dir as NSString).appendingPathComponent("packages/runtime/src/index.ts"))
                candidates.append((dir as NSString).appendingPathComponent("node_modules/@yourtm/runtime/src/index.ts"))
                candidates.append((dir as NSString).appendingPathComponent("../runtime/src/index.ts"))
                let parent = (dir as NSString).deletingLastPathComponent
                if parent == dir { break }
                dir = parent
            }
        }

        walkUp(from: projectPath)
        if let bundled = Foundation.Bundle.main.resourceURL?.path { walkUp(from: bundled) }
        walkUp(from: fm.currentDirectoryPath)

        guard let found = candidates.first(where: { fm.fileExists(atPath: $0) }) else {
            throw BuildError.runtimeNotFound(candidates)
        }
        return (found as NSString).standardizingPath
    }

    // MARK: Definitions with functions preserved

    /// Re-evaluate the container, keeping functions as `__FUNC_…__` strings and
    /// RegExps as `{__regexp, flags}`, exactly as the engine's replacers do.
    private static func definitionsJSON(projectPath: String) async throws -> (triggers: String, variables: String) {
        let work = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("ytm-build-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: work) }

        let stub = work.appendingPathComponent("yourtm-core-stub.js")
        try NativeProjectReader.stubSource.write(to: stub, atomically: true, encoding: .utf8)

        var imports: [String] = []
        var rows: [AssetKind: [String]] = [:]
        var index = 0
        for kind in [AssetKind.triggers, .variables] {
            var refs: [String] = []
            for file in NativeProjectReader.assetFiles(projectPath: projectPath, kind: kind) {
                let alias = "b\(index)"; index += 1
                imports.append("import * as \(alias) from \(NativeProjectReader.jsString(file.path))")
                refs.append(alias)
            }
            rows[kind] = refs
        }

        let entrySource = """
        \(imports.joined(separator: "\n"))

        const slug = (s) => String(s).toLowerCase()
          .replace(/\\s+/g, '-').replace(/[^a-z0-9-_]/g, '');

        function collect(mod) {
          const out = [];
          const take = (d) => {
            if (!d || typeof d !== 'object' || (!d.id && !d.name)) return;
            const c = { ...d };
            if (!c.id) c.id = slug(c.name);
            out.push(c);
          };
          if (Array.isArray(mod.default)) mod.default.forEach(take);
          else if (mod.default) take(mod.default);
          for (const [k, v] of Object.entries(mod)) if (k !== 'default') take(v);
          return out;
        }

        const triggers = [\(rows[.triggers]!.joined(separator: ", "))].flatMap(collect);
        const variables = [\(rows[.variables]!.joined(separator: ", "))].flatMap(collect);

        // Same replacers the engine uses. A function becomes its own source
        // wrapped in __FUNC_…__, which the generated entry point evals back.
        globalThis.YTM_TRIGGERS = JSON.stringify(triggers, (_k, v) =>
          v instanceof RegExp ? { __regexp: v.source, flags: v.flags } : v);
        globalThis.YTM_VARIABLES = JSON.stringify(variables, (_k, v) =>
          typeof v === 'function' ? `__FUNC_${v.toString()}__` : v);
        """
        let entry = work.appendingPathComponent("defs.mjs")
        try entrySource.write(to: entry, atomically: true, encoding: .utf8)

        let compiled: NativeCompiler.Result
        do {
            compiled = try await NativeCompiler().bundle(
                entry: entry,
                alias: ["@yourtm/core": stub.path,
                        "@yourtm/vendors": stub.path,
                        "@yourtm/runtime": stub.path],
                minify: false
            )
        } catch {
            throw BuildError.bundle(error.localizedDescription)
        }

        let ctx = JSContext()!
        var thrown: String?
        ctx.exceptionHandler = { _, exc in thrown = exc?.toString() ?? "unknown JS exception" }
        ctx.evaluateScript(compiled.code)
        if let thrown { throw BuildError.evaluate(thrown) }

        guard let t = ctx.objectForKeyedSubscript("YTM_TRIGGERS")?.toString(),
              let v = ctx.objectForKeyedSubscript("YTM_VARIABLES")?.toString() else {
            throw BuildError.evaluate("definitions produced no output")
        }
        return (t, v)
    }

    // MARK: Core bundle

    /// Build `core.js` — the runtime plus this container's triggers and variables.
    static func buildCore(
        projectPath: String,
        containerId: String,
        debug: Bool = false,
        minify: Bool = false
    ) async throws -> Bundle {
        guard !projectPath.isEmpty else { throw BuildError.noProject }

        let runtimeSrc = try resolveRuntimeSource(projectPath: projectPath)
        let defs = try await definitionsJSON(projectPath: projectPath)

        // Byte-for-byte the engine's template — leading newline and two-space
        // indentation included, because any difference shows up in the output.
        let entryCode = """

        import { initYourTM } from '\(runtimeSrc)';

        const config = {
          containerId: '\(containerId)',
          debug: \(debug),
          triggers: \(defs.triggers),
          variables: \(defs.variables)
        };

        // Revive variables if they have functions
        if (config.variables) {
          config.variables.forEach(v => {
            Object.keys(v).forEach(k => {
              if (typeof v[k] === 'string' && v[k].startsWith('__FUNC_')) {
                const fnStr = v[k].substring(7, v[k].length - 2);
                try {
                  v[k] = eval('(' + fnStr + ')');
                } catch(e) {
                  console.error('[YTM] Failed to revive function', k, e);
                }
              }
            });
          });
        }

        initYourTM(config);

        """

        let work = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("ytm-core-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: work) }

        // The engine feeds this through esbuild's stdin with `loader: ts`; a
        // .ts file on disk is the same input with a resolvable directory.
        let entry = work.appendingPathComponent("entry.ts")
        try entryCode.write(to: entry, atomically: true, encoding: .utf8)

        do {
            let result = try await NativeCompiler().bundle(
                entry: entry,
                globalName: "YTM_CORE",
                target: "es2020",
                minify: minify
            )
            return Bundle(name: minify ? "core.min.js" : "core.js", code: result.code)
        } catch {
            throw BuildError.bundle(error.localizedDescription)
        }
    }
}
