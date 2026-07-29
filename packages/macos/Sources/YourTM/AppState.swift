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

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let p = api.project()
            async let s = api.settings()
            project = try await p
            settings = try await s
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func saveAsset(kind: AssetKind, id: String, updates: [String: Any]) async -> Bool {
        do {
            let result = try await api.updateAsset(kind: kind, id: id, updates: updates)
            if result.success == false {
                lastError = result.error ?? "Save failed"
                return false
            }
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
