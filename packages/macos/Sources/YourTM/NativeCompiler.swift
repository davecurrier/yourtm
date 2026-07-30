import Foundation

/// Compiles container sources by driving the bundled esbuild binary directly.
///
/// esbuild is a self-contained Mach-O executable — the `esbuild` npm package is
/// only a Node wrapper around it. Invoking the binary means the app can build a
/// container with no Node, no npm install, and no toolchain on the machine.
struct NativeCompiler {

    enum CompileError: LocalizedError {
        case binaryMissing
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .binaryMissing:
                return "The bundled esbuild binary is missing. Run scripts/build-js-runtime.sh."
            case .failed(let message):
                return message
            }
        }
    }

    struct Result {
        var code: String
        var warnings: [String]
    }

    /// Path to esbuild inside the .app, falling back to the source tree for `swift run`.
    static var binaryURL: URL? {
        if let url = Bundle.main.url(forResource: "esbuild", withExtension: nil),
           FileManager.default.isExecutableFile(atPath: url.path) {
            return url
        }
        return ScriptRuntime.developmentResourceURL(named: "esbuild")
    }

    /// Bundle one entry point to an IIFE.
    ///
    /// This is the low-level primitive only. A full container build does more:
    /// `packages/cli/src/compiler/index.ts` marks `@yourtm/*` external, then
    /// strips those import statements from the output and injects identity
    /// shims for the `define*()` helpers. Marking them external and stopping
    /// there leaves esbuild's `require` shim in the bundle, which throws in a
    /// browser — so callers must not treat this as a finished container build
    /// until that post-processing is ported across.
    ///
    /// - Parameters:
    ///   - externals: module specifiers to leave unresolved.
    ///   - alias: module specifier -> file path. Preferred over `externals` for
    ///     the `@yourtm/*` packages: aliasing to a stub lets esbuild resolve
    ///     them normally, where marking them external leaves a `require` shim
    ///     that throws in a browser and forces the caller into text surgery.
    func bundle(
        entry: URL,
        externals: [String] = [],
        alias: [String: String] = [:],
        globalName: String? = nil,
        target: String? = nil,
        minify: Bool = true
    ) async throws -> Result {
        guard let binary = Self.binaryURL else { throw CompileError.binaryMissing }

        var args = [entry.path, "--bundle", "--format=iife", "--log-level=warning"]
        if minify { args.append("--minify") }
        if let globalName { args.append("--global-name=\(globalName)") }
        if let target { args.append("--target=\(target)") }
        args.append(contentsOf: externals.map { "--external:\($0)" })
        args.append(contentsOf: alias.sorted { $0.key < $1.key }.map { "--alias:\($0.key)=\($0.value)" })

        let process = Process()
        process.executableURL = binary
        process.arguments = args
        process.currentDirectoryURL = entry.deletingLastPathComponent()

        let out = Pipe(), err = Pipe()
        process.standardOutput = out
        process.standardError = err
        try process.run()

        // Read before waiting: a pipe that fills up would deadlock the child.
        let outData = out.fileHandleForReading.readDataToEndOfFile()
        let errData = err.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()

        let stderr = String(data: errData, encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            throw CompileError.failed(stderr.isEmpty
                ? "esbuild exited with status \(process.terminationStatus)"
                : stderr)
        }

        let warnings = stderr
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map(String.init)
            .filter { $0.contains("▲") || $0.lowercased().contains("warning") }

        return Result(code: String(data: outData, encoding: .utf8) ?? "", warnings: warnings)
    }

    /// esbuild's own version, useful for diagnostics in Settings.
    func version() async -> String? {
        guard let binary = Self.binaryURL else { return nil }
        let process = Process()
        process.executableURL = binary
        process.arguments = ["--version"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        guard (try? process.run()) != nil else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
