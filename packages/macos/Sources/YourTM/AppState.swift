import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    let api = APIClient()

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

    /// Reload settings and the container.
    ///
    /// Settings still come from the engine; the container is read natively —
    /// esbuild bundles the sources and JavaScriptCore evaluates them, taking
    /// the app's primary data path off Node. Verified against the engine on the
    /// reference container: every field the engine reports is identical, and
    /// native additionally reports `sourcePath` for triggers, variables and
    /// zones, which the engine omits.
    ///
    /// The engine remains a fallback while the port is in progress, so a
    /// regression in the native reader degrades rather than blanks the app. The
    /// failure is surfaced, not swallowed.
    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        // Settings must land first: the project path comes from them, and on a
        // cold launch it is still empty. Reading concurrently would send "" to
        // the reader and fall back to the engine on every first refresh.
        if let s = NativeSettings.load() {
            settings = s
        } else if let s = try? await api.settings() {
            settings = s
        }

        do {
            project = try await NativeProjectReader.read(projectPath: projectPath)
            lastError = nil
        } catch {
            if let fallback = try? await api.project() {
                project = fallback
                lastError = "Native read failed, using the engine: \(error.localizedDescription)"
            } else {
                lastError = error.localizedDescription
            }
        }
    }

    /// Write an asset's source natively, via ts-morph in JavaScriptCore.
    ///
    /// Swift is the *sole* writer on purpose. The engine's `updateAssetProperties`
    /// edits through a cached ts-morph Project, so if both wrote, an engine-side
    /// edit would silently revert a Swift one from its stale in-memory copy.
    /// Reads stay on the engine, which recompiles from disk on every refresh and
    /// therefore sees these writes immediately.
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
