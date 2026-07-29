import Foundation

/// Manages the headless Node engine (the Next.js API server).
/// If something is already serving :3344 we adopt it; otherwise we spawn
/// `next dev` in the desktop package and kill it when the app quits.
@MainActor
final class BackendManager: ObservableObject {
    enum State: Equatable {
        case starting
        case running(adopted: Bool)
        case failed(String)
    }

    @Published var state: State = .starting

    private var process: Process?
    private let api = APIClient()

    /// Locations to look for the desktop package (the engine lives there).
    private static let desktopCandidates = [
        "/Users/davidcurrier/Dave/AppDev/Dave/Tag/yourtm-cli/packages/desktop",
    ]

    func start() async {
        state = .starting

        if await api.health() {
            state = .running(adopted: true)
            return
        }

        guard let desktopDir = Self.desktopCandidates.first(where: {
            FileManager.default.fileExists(atPath: $0 + "/package.json")
        }) else {
            state = .failed("Engine not found. Expected the desktop package at:\n\(Self.desktopCandidates.joined(separator: "\n"))")
            return
        }

        guard let node = Self.findNode() else {
            state = .failed("Node.js not found. Install Node or ensure it is on PATH.")
            return
        }

        let nextBin = desktopDir + "/../../node_modules/next/dist/bin/next"
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: node)
        proc.arguments = [nextBin, "dev", "-p", "3344"]
        proc.currentDirectoryURL = URL(fileURLWithPath: desktopDir)
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = (env["PATH"] ?? "") + ":" + (node as NSString).deletingLastPathComponent
        proc.environment = env
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice

        do {
            try proc.run()
            process = proc
        } catch {
            state = .failed("Failed to launch engine: \(error.localizedDescription)")
            return
        }

        // Poll for readiness (up to ~30s)
        for _ in 0..<60 {
            try? await Task.sleep(nanoseconds: 500_000_000)
            if await api.health() {
                state = .running(adopted: false)
                return
            }
            if !proc.isRunning {
                state = .failed("Engine process exited during startup.")
                return
            }
        }
        state = .failed("Engine did not become ready on :3344.")
    }

    nonisolated func stop() {
        // Only stop a process we spawned; never kill an adopted server.
        Task { @MainActor in
            self.process?.terminate()
            self.process = nil
        }
    }

    private static func findNode() -> String? {
        let candidates = [
            "/Users/davidcurrier/.nvm/versions/node/v22.13.0/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
        ]
        if let hit = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }) {
            return hit
        }
        // Fall back to PATH lookup via /usr/bin/env
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        p.arguments = ["node"]
        let pipe = Pipe()
        p.standardOutput = pipe
        try? p.run()
        p.waitUntilExit()
        let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (out?.isEmpty == false) ? out : nil
    }
}
