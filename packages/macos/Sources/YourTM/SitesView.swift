import Security
import SwiftUI

/// WordPress sites this container publishes to.
///
/// Publishing has two paths: the Cloudflare worker (Deploy) and platform
/// modules like the WordPress plugin, which serve the bundle same-origin and
/// need no worker at all. This screen drives the second path, so the whole
/// publish story lives in the Mac app rather than half here and half in `ytm deploy`.
struct SitesView: View {
    @EnvironmentObject var state: AppState

    @State private var sites: [WordPressSite] = []
    @State private var loading = true
    @State private var working: String?          // site id (or "add") of the in-flight op
    @State private var showAdd = false
    @State private var pendingRemoval: WordPressSite?
    @State private var results: [String: String] = [:]   // site id -> last result line

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if loading {
                    ProgressView().controlSize(.small)
                } else if sites.isEmpty {
                    emptyState
                } else {
                    ForEach(sites) { site in
                        siteCard(site)
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 720, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .navigationTitle("Sites")
        .toolbar {
            ToolbarItem {
                Button {
                    showAdd = true
                } label: {
                    Label("Connect Site", systemImage: "plus")
                }
                .disabled(working != nil)
            }
        }
        .sheet(isPresented: $showAdd) {
            AddSiteSheet(existingHosts: Set(sites.map(\.host))) { await load() }
        }
        .confirmationDialog(
            "Disconnect \(pendingRemoval?.host ?? "")?",
            isPresented: Binding(get: { pendingRemoval != nil },
                                 set: { if !$0 { pendingRemoval = nil } }),
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) {
                if let s = pendingRemoval { Task { await remove(s) } }
            }
        } message: {
            Text("Removes the site from this app only. The plugin keeps serving the bundle it already has until you deactivate it in WordPress.")
        }
        .task { await load() }
    }

    // MARK: Empty state

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("No sites connected", systemImage: "globe").font(.title3.bold())
            Text("Connect a WordPress install running the YourTM plugin to publish bundles straight to it — same-origin, no worker in the request path.")
                .font(.callout).foregroundStyle(.secondary)
            Button {
                showAdd = true
            } label: {
                Label("Connect Site", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Site card

    private func siteCard(_ site: WordPressSite) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Circle()
                    .fill(site.isConnected ? Color.green : Color.secondary)
                    .frame(width: 8, height: 8)
                Text(site.host).font(.title3.bold())
                Text(site.environment)
                    .font(.caption)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())
                Spacer()
                Menu {
                    Button("Refresh Site Info") { Task { await action(site, "refresh") } }
                    Button("Purge Caches") { Task { await action(site, "purge_cache") } }
                    Divider()
                    Button("Open Site", systemImage: "safari") {
                        if let u = URL(string: site.url) { NSWorkspace.shared.open(u) }
                    }
                    Divider()
                    Button("Disconnect", role: .destructive) { pendingRemoval = site }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .disabled(working != nil)
            }

            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 5) {
                GridRow {
                    Text("Bundle").foregroundStyle(.secondary)
                    Text(site.bundleVersion.isEmpty ? "Never synced" : site.bundleVersion)
                        .font(.body.monospaced())
                }
                GridRow {
                    Text("Last sync").foregroundStyle(.secondary)
                    Text(site.lastSync.isEmpty ? "—" : friendlyDate(site.lastSync))
                }
                if !site.wordpressVersion.isEmpty || !site.phpVersion.isEmpty {
                    GridRow {
                        Text("Runtime").foregroundStyle(.secondary)
                        Text([
                            site.wordpressVersion.isEmpty ? nil : "WordPress \(site.wordpressVersion)",
                            site.phpVersion.isEmpty ? nil : "PHP \(site.phpVersion)",
                            site.woocommerce ? "WooCommerce" : nil,
                        ].compactMap { $0 }.joined(separator: " · "))
                    }
                }
                if !site.containerId.isEmpty, site.containerId != state.containerId {
                    GridRow {
                        Text("Container").foregroundStyle(.secondary)
                        Label("\(site.containerId) — does not match \(state.containerId)",
                              systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
            }
            .font(.callout)

            HStack(spacing: 10) {
                Button {
                    Task { await sync(site) }
                } label: {
                    Label(working == site.id ? "Publishing…" : "Publish Bundle",
                          systemImage: "arrow.up.circle")
                }
                .buttonStyle(.borderedProminent)
                .disabled(working != nil)

                if working == site.id { ProgressView().controlSize(.small) }

                if let line = results[site.id] {
                    Text(line)
                        .font(.caption)
                        .foregroundStyle(line.hasPrefix("Failed") ? .red : .secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Actions

    private func load() async {
        loading = true
        defer { loading = false }
        sites = NativeWordPress.sites()
    }

    private func sync(_ site: WordPressSite) async {
        working = site.id
        defer { working = nil }
        do {
            let r = try await NativeWordPress.sync(site: site, projectPath: state.projectPath,
                                                   containerId: state.containerId)
            let size = ByteCountFormatter.string(fromByteCount: Int64(r.totalSize), countStyle: .file)
            results[site.id] = "Published \(r.version) · \(r.bundles) bundles · \(size)"
            state.showToast("Published to \(site.host)")
        } catch {
            results[site.id] = "Failed — \(error.localizedDescription)"
        }
        await load()
    }

    private func action(_ site: WordPressSite, _ name: String) async {
        working = site.id
        defer { working = nil }
        do {
            results[site.id] = try await NativeWordPress.action(site: site, name)
        } catch {
            results[site.id] = "Failed — \(error.localizedDescription)"
        }
        await load()
    }

    private func remove(_ site: WordPressSite) async {
        working = site.id
        defer { working = nil }
        NativeWordPress.removeSite(id: site.id)
        pendingRemoval = nil
        await load()
    }

    private func friendlyDate(_ iso: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return fmt.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Add site

private struct AddSiteSheet: View {
    let existingHosts: Set<String>
    let onDone: () async -> Void

    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var url = ""
    @State private var apiKey = ""
    @State private var environment = "staging"
    @State private var copied = false
    @State private var testResult: String?
    @State private var testPassed = false
    @State private var working: String?

    private var host: String { URL(string: url)?.host ?? "" }
    private var duplicate: Bool { !host.isEmpty && existingHosts.contains(host) }
    private var canSubmit: Bool {
        !url.isEmpty && !apiKey.isEmpty && working == nil && !duplicate
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connect WordPress Site").font(.title2.bold())
            Text("The API key is a shared secret — nothing generates it for you. Make one here, paste it into Settings → YourTM Tag Manager on the site, save there, then Connect.")
                .font(.callout).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Form {
                TextField("Site URL", text: $url, prompt: Text("https://example.com"))

                // Shown in the clear on purpose: it has to be copied into
                // WordPress by hand, and obscuring it just invites typos.
                LabeledContent("API Key") {
                    HStack(spacing: 6) {
                        TextField("", text: $apiKey, prompt: Text("ytm_key_…"))
                            .textFieldStyle(.roundedBorder)
                            .font(.body.monospaced())
                        Button("Generate") { generateKey() }
                        Button {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(apiKey, forType: .string)
                            copied = true
                        } label: {
                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        }
                        .disabled(apiKey.isEmpty)
                        .help("Copy the key")
                    }
                }

                Picker("Environment", selection: $environment) {
                    Text("Staging").tag("staging")
                    Text("Production").tag("production")
                }
                .pickerStyle(.segmented)
            }
            .formStyle(.grouped)
            .onChange(of: url) { _, _ in testPassed = false; testResult = nil }
            .onChange(of: apiKey) { _, _ in testPassed = false; testResult = nil; copied = false }

            if duplicate {
                Label("\(host) is already connected.", systemImage: "exclamationmark.triangle")
                    .font(.callout).foregroundStyle(.orange)
            } else if let testResult {
                Label(testResult, systemImage: testPassed ? "checkmark.circle" : "xmark.circle")
                    .font(.callout)
                    .foregroundStyle(testPassed ? .green : .red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Button("Test") { Task { await test() } }
                    .disabled(!canSubmit)
                if working != nil { ProgressView().controlSize(.small) }
                Spacer()
                Button("Cancel") { dismiss() }
                Button("Connect") { Task { await connect() } }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSubmit)
            }
        }
        .padding(20)
        .frame(width: 460)
    }

    /// 32 hex characters from the system CSPRNG — long enough that the
    /// hash_equals() check on the WordPress side is not the weak link.
    private func generateKey() {
        var bytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        apiKey = "ytm_key_" + bytes.map { String(format: "%02x", $0) }.joined()
        copied = false
    }

    private func test() async {
        working = "test"
        defer { working = nil }
        do {
            let message = await NativeWordPress.test(url: normalizedURL, apiKey: apiKey)
            testPassed = message.hasPrefix("Connection successful")
            testResult = message
        }
    }

    private func connect() async {
        working = "connect"
        defer { working = nil }
        do {
            let site = try await NativeWordPress.addSite(
                url: normalizedURL, apiKey: apiKey,
                containerId: state.containerId, environment: environment
            )
            state.showToast("Connected \(site.host)")
            await onDone()
            dismiss()
        } catch {
            testPassed = false
            testResult = error.localizedDescription
        }
    }

    /// The engine strips trailing slashes, but a bare `example.com` would
    /// otherwise be sent without a scheme and fail to parse server-side.
    private var normalizedURL: String {
        let trimmed = url.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") { return trimmed }
        return "https://" + trimmed
    }
}
