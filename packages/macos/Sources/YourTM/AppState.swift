import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    /// Receives preview beacons on localhost:3344 for the whole app session.
    let telemetry = TelemetryHub()
    /// Serves preview builds on localhost:3456 when started from Preview.
    let devServer = DevServer()

    @Published var project = ProjectData()
    @Published var settings = AppSettings()
    @Published var isLoading = false
    @Published var lastError: String?
    @Published var toast: String?

    var containerId: String { settings.project?.containerId ?? "—" }
    var containerName: String { settings.project?.containerName ?? "No project" }
    var projectPath: String { settings.project?.path ?? "" }
    var hasCloudflareCreds: Bool {
        !(settings.cloudflare?.accountId ?? "").isEmpty && !(settings.cloudflare?.apiToken ?? "").isEmpty
    }

    /// Reload settings and the container, both natively: settings from
    /// `~/.yourtm/config.json`, the container by bundling its sources with
    /// esbuild and evaluating them in JavaScriptCore.
    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        // Settings first: the project path comes from them.
        settings = NativeSettings.load() ?? AppSettings()

        guard !projectPath.isEmpty else {
            project = ProjectData()
            lastError = "No project is open. Choose one in Settings."
            return
        }
        do {
            project = try await NativeProjectReader.read(projectPath: projectPath)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// Write an asset's source natively, via ts-morph in JavaScriptCore.
    ///
    /// Verified byte-identical to the engine's output across all 21 tags in the
    /// reference container before this was switched over.
    func saveAsset(kind: AssetKind, id: String, updates: [String: Any]) async -> Bool {
        do {
            try await ScriptRuntime.shared.applyEdit(
                kind: kind, id: id, projectPath: projectPath, updates: updates
            )
            await refresh()
            showToast("Saved \(id)")
            return true
        } catch {
            lastError = error.localizedDescription
            return false
        }
    }

    func showToast(_ message: String) {
        toast = message
        Task {
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            if toast == message { toast = nil }
        }
    }
}

enum SidebarItem: String, CaseIterable, Identifiable, Hashable {
    case dashboard, tags, triggers, variables, zones, preview, deploy, sites, importGTM, settings
    var id: String { rawValue }

    var title: String {
        switch self {
        case .dashboard: return "Dashboard"
        case .preview: return "Preview"
        case .deploy: return "Deploy"
        case .sites: return "Sites"
        case .importGTM: return "Import"
        case .settings: return "Settings"
        default: return rawValue.capitalized
        }
    }

    var systemImage: String {
        switch self {
        case .dashboard: return "gauge.medium"
        case .tags: return "tag"
        case .triggers: return "bolt"
        case .variables: return "curlybraces"
        case .zones: return "square.grid.2x2"
        case .preview: return "dot.radiowaves.left.and.right"
        case .deploy: return "arrow.up.circle"
        case .sites: return "globe"
        case .importGTM: return "square.and.arrow.down"
        case .settings: return "gearshape"
        }
    }

    var assetKind: AssetKind? {
        switch self {
        case .tags: return .tags
        case .triggers: return .triggers
        case .variables: return .variables
        case .zones: return .zones
        default: return nil
        }
    }
}
