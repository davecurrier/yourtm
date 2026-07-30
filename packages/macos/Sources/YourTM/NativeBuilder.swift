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

    // MARK: Zone and default bundles

    /// Faithful port of `generateTagsCode()` from the CLI compiler.
    ///
    /// Kept in JavaScript rather than Swift on purpose: it has to distinguish a
    /// function `execute` from a string `code` and call `.toString()` on the
    /// former, including un-shorthanding ES6 methods (`execute(ctx){}` is not a
    /// valid expression on its own). Swift cannot see into a JS closure, so
    /// doing this anywhere else would mean giving up function-bodied tags.
    private static let tagsCodeGenerator = """
    const sanitizeId = (id) => String(id).replace(/[-\\s]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

    function fnSource(fn) {
      let s = fn.toString();
      if (s.startsWith('async ') && !s.startsWith('async function')) {
        s = s.replace(/^async\\s+/, 'async function ');
      } else if (!s.startsWith('function') && !s.startsWith('async') && !s.startsWith('(')) {
        s = 'function ' + s;
      }
      return s;
    }

    function generateTagsCode(tags, zone) {
      const tagsJson = tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        type: tag.type,
        triggers: tag.triggers,
        priority: tag.priority || 0,
        consent: tag.consent || [],
        platform: tag.platform,
        code: `__TAG_${sanitizeId(tag.id)}__`,
      }));

      let code = `
    (function() {
      'use strict';
    `;

      tags.forEach((tag) => {
        const safeId = sanitizeId(tag.id);
        const executeFunc = tag.execute || tag.code;
        let tagCode;
        if (typeof executeFunc === 'function') tagCode = fnSource(executeFunc);
        else if (typeof executeFunc === 'string') tagCode = `function(context) { ${executeFunc} }`;
        else tagCode = 'function(context) {}';

        let setupCode = null;
        if (tag.setup && typeof tag.setup === 'function') setupCode = fnSource(tag.setup);

        code += `
      function __TAG_${safeId}__(context) {
        return (${tagCode})(context);
      }
    `;
        if (setupCode) {
          code += `
      __TAG_${safeId}__._setup = ${setupCode};
    `;
        }
      });

      code += `
      var tags = ${JSON.stringify(tagsJson)};
      tags.forEach(function(tag) {
        tag.code = eval(tag.code);
        window.YourTM.registerTag(tag);
      });
    `;

      if (zone) {
        const patterns = zone.patterns || zone.urlPatterns || [];
        code += `
      // Zone: ${zone.name}
      // URL Patterns: ${JSON.stringify(patterns)}
    `;
      }

      code += `
    })();
    `;
      return code;
    }
    """

    /// Generated sources for every zone bundle plus the orphan-tag bundle,
    /// keyed by output file name. Produced in one JavaScriptCore pass so tag
    /// functions are still live objects when their source is captured.
    private static func bundleSources(projectPath: String) async throws -> [(name: String, source: String)] {
        let work = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("ytm-zones-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: work) }

        let stub = work.appendingPathComponent("yourtm-core-stub.js")
        try NativeProjectReader.stubSource.write(to: stub, atomically: true, encoding: .utf8)

        var imports: [String] = []
        var refs: [AssetKind: [String]] = [:]
        var index = 0
        for kind in [AssetKind.tags, .zones] {
            var list: [String] = []
            for file in NativeProjectReader.assetFiles(projectPath: projectPath, kind: kind) {
                let alias = "z\(index)"; index += 1
                imports.append("import * as \(alias) from \(NativeProjectReader.jsString(file.path))")
                list.append(alias)
            }
            refs[kind] = list
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

        \(tagsCodeGenerator)

        const tags  = [\(refs[.tags]!.joined(separator: ", "))].flatMap(collect);
        const zones = [\(refs[.zones]!.joined(separator: ", "))].flatMap(collect);

        const out = [];
        const claimed = new Set();

        for (const zone of zones) {
          // A tag belongs to a zone by id or by name, and a zone may also list
          // tags explicitly — both routes, as the engine does.
          const inZone = tags.filter((t) => {
            const tz = t.zones || [];
            return tz.includes(zone.id) || tz.includes(zone.name);
          });
          for (const tagId of zone.tags || []) {
            const t = tags.find((x) => x.id === tagId);
            if (t && !inZone.includes(t)) inZone.push(t);
          }
          inZone.forEach((t) => claimed.add(t.id));
          out.push({ name: `zone-${zone.id}.js`, source: generateTagsCode(inZone, zone) });
        }

        const orphans = tags.filter((t) => !claimed.has(t.id));
        if (orphans.length > 0) {
          out.push({ name: 'tags.js', source: generateTagsCode(orphans) });
        }

        globalThis.YTM_BUNDLE_SOURCES = JSON.stringify(out);
        """
        let entry = work.appendingPathComponent("zones.mjs")
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

        guard let json = ctx.objectForKeyedSubscript("YTM_BUNDLE_SOURCES")?.toString(),
              let data = json.data(using: .utf8),
              let rows = (try? JSONSerialization.jsonObject(with: data)) as? [[String: String]] else {
            throw BuildError.evaluate("zone sources produced no output")
        }
        return rows.compactMap { r in
            guard let n = r["name"], let s = r["source"] else { return nil }
            return (name: n, source: s)
        }
    }

    /// `outDir` from `yourtm.config.ts`, defaulting to the engine's `dist/ytm`.
    static func outputDirectory(projectPath: String) -> URL {
        let configURL = URL(fileURLWithPath: projectPath).appendingPathComponent("yourtm.config.ts")
        var rel = "dist/ytm"
        if let text = try? String(contentsOf: configURL, encoding: .utf8),
           let re = try? NSRegularExpression(pattern: #"outDir:\s*['"]([^'"]+)['"]"#),
           let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
           m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: text) {
            rel = String(text[r])
        }
        return URL(fileURLWithPath: projectPath).appendingPathComponent(rel)
    }

    /// Build everything and write it to the project's output directory.
    @discardableResult
    static func buildAndWrite(
        projectPath: String, containerId: String, debug: Bool = false, minify: Bool = true
    ) async throws -> [Bundle] {
        let bundles = try await buildAll(projectPath: projectPath, containerId: containerId,
                                         debug: debug, minify: minify)
        let dir = outputDirectory(projectPath: projectPath)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        for b in bundles {
            try b.code.write(to: dir.appendingPathComponent(b.name), atomically: true, encoding: .utf8)
        }
        return bundles
    }

    /// Build every bundle: core, one per zone, and the orphan-tag bundle.
    static func buildAll(
        projectPath: String,
        containerId: String,
        debug: Bool = false,
        minify: Bool = true
    ) async throws -> [Bundle] {
        var bundles = [try await buildCore(projectPath: projectPath, containerId: containerId,
                                           debug: debug, minify: minify)]
        // core.js keeps its name whether or not it is minified; only the
        // standalone core.min.js artefact uses the other name.
        bundles[0].name = "core.js"

        let work = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("ytm-zb-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: work) }

        for (name, source) in try await bundleSources(projectPath: projectPath) {
            // Written as .js: the engine feeds these through esbuild's stdin
            // with `loader: 'js'`, and they contain no TypeScript.
            let file = work.appendingPathComponent(name)
            try source.write(to: file, atomically: true, encoding: .utf8)
            let result = try await NativeCompiler().bundle(
                entry: file, target: "es2020", minify: minify
            )
            bundles.append(Bundle(name: name, code: result.code))
        }
        return bundles
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
