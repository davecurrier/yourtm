import SwiftUI

@main
struct YourTMApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var backend = BackendManager()
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup("YourTM") {
            RootView()
                .environmentObject(backend)
                .environmentObject(state)
                .frame(minWidth: 980, minHeight: 640)
                .task {
                    await backend.start()
                    if case .running = backend.state {
                        await state.refresh()
                    }
                    AppDelegate.shared = appDelegate
                    appDelegate.backend = backend
                }
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("Refresh Project") {
                    Task { await state.refresh() }
                }
                .keyboardShortcut("r", modifiers: .command)
            }
        }

        Settings {
            SettingsView()
                .environmentObject(state)
                .frame(width: 520)
                .padding()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    static var shared: AppDelegate?
    var backend: BackendManager?

    func applicationWillTerminate(_ notification: Notification) {
        backend?.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

struct RootView: View {
    @EnvironmentObject var backend: BackendManager
    @EnvironmentObject var state: AppState
    @State private var selection: SidebarItem? = .dashboard

    var body: some View {
        Group {
            switch backend.state {
            case .starting:
                VStack(spacing: 14) {
                    ProgressView()
                    Text("Starting YourTM engine…")
                        .foregroundStyle(.secondary)
                }
            case .failed(let message):
                VStack(spacing: 14) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.system(size: 36))
                        .foregroundStyle(.orange)
                    Text("Engine failed to start").font(.headline)
                    Text(message)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 460)
                    Button("Retry") { Task { await backend.start(); await state.refresh() } }
                        .keyboardShortcut(.defaultAction)
                }
                .padding()
            case .running:
                mainInterface
            }
        }
        .overlay(alignment: .bottom) {
            if let toast = state.toast {
                Text(toast)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.bottom, 16)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: state.toast)
    }

    private var mainInterface: some View {
        NavigationSplitView {
            List(selection: $selection) {
                Section {
                    ForEach([SidebarItem.dashboard], id: \.self) { item in
                        Label(item.title, systemImage: item.systemImage).tag(item)
                    }
                }
                Section("Container") {
                    ForEach([SidebarItem.tags, .triggers, .variables, .zones], id: \.self) { item in
                        HStack {
                            Label(item.title, systemImage: item.systemImage)
                            Spacer()
                            if let kind = item.assetKind {
                                Text("\(state.project.assets(kind).count)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                        }
                        .tag(item)
                    }
                }
                Section("Operations") {
                    ForEach([SidebarItem.preview, .deploy, .sites, .importGTM, .settings], id: \.self) { item in
                        Label(item.title, systemImage: item.systemImage).tag(item)
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 190, ideal: 210)
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.containerName).font(.caption).bold()
                    Text(state.containerId).font(.caption2).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(.bar)
            }
        } detail: {
            switch selection ?? .dashboard {
            case .dashboard: DashboardView()
            case .tags: AssetListView(kind: .tags)
            case .triggers: AssetListView(kind: .triggers)
            case .variables: AssetListView(kind: .variables)
            case .zones: AssetListView(kind: .zones)
            case .preview: PreviewView()
            case .deploy: DeployView()
            case .sites: SitesView()
            case .importGTM: ImportView()
            case .settings: SettingsView().padding()
            }
        }
    }
}
