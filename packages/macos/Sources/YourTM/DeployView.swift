import SwiftUI

struct DeployView: View {
    @EnvironmentObject var state: AppState

    @State private var deployment: DeploymentInfo?
    @State private var rum: RUMStatus?
    @State private var buildOutput: String?
    @State private var working: String? // label of in-flight operation
    @State private var confirmDeploy = false
    @AppStorage("deployEnvironment") private var environment = "staging"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                buildSection
                deploySection
                rumSection
            }
            .padding(24)
            .frame(maxWidth: 720, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .navigationTitle("Deploy")
        .task { await load() }
        .confirmationDialog(
            "Deploy worker to Cloudflare?",
            isPresented: $confirmDeploy
        ) {
            Button("Deploy") { Task { await deploy() } }
        } message: {
            Text("This deploys the container worker for \(state.containerId) to \(environment) in your Cloudflare account.")
        }
    }

    // MARK: Build

    private var buildSection: some View {
        section("Build", symbol: "hammer") {
            Text("Compile the container bundles from the TypeScript sources.")
                .font(.callout).foregroundStyle(.secondary)
            HStack {
                Button {
                    Task { await build() }
                } label: {
                    Label(working == "build" ? "Building…" : "Build Container", systemImage: "hammer")
                }
                .disabled(working != nil)
                if working == "build" { ProgressView().controlSize(.small) }
            }
            if let out = buildOutput {
                ScrollView {
                    Text(out)
                        .font(.caption.monospaced())
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 160)
                .padding(8)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    // MARK: Deploy

    private var deploySection: some View {
        section("Cloudflare Worker", symbol: "arrow.up.circle") {
            if let d = deployment, d.deployed == true {
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 6) {
                    if let url = d.workerUrl {
                        GridRow {
                            Text("Worker URL").foregroundStyle(.secondary)
                            Link(url, destination: URL(string: url) ?? URL(string: "https://cloudflare.com")!)
                                .font(.body.monospaced())
                        }
                    }
                    if let name = d.workerName {
                        GridRow {
                            Text("Worker").foregroundStyle(.secondary)
                            Text(name).font(.body.monospaced())
                        }
                    }
                    if let at = d.deployedAt {
                        GridRow {
                            Text("Deployed").foregroundStyle(.secondary)
                            Text(at)
                        }
                    }
                }
                .font(.callout)
            } else {
                Label(deployment?.message ?? "Not deployed", systemImage: "circle.dashed")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }

            if !state.hasCloudflareCreds {
                Label("Add your Cloudflare Account ID and API token in Settings to enable deploys.",
                      systemImage: "key")
                    .font(.callout)
                    .foregroundStyle(.orange)
            }

            HStack(spacing: 10) {
                Picker("Target", selection: $environment) {
                    Text("Staging").tag("staging")
                    Text("Production").tag("production")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .frame(width: 200)

                Button {
                    confirmDeploy = true
                } label: {
                    Label(working == "deploy" ? "Deploying…" : "Deploy to \(environment.capitalized)",
                          systemImage: "arrow.up.circle")
                }
                .buttonStyle(.borderedProminent)
                .tint(environment == "production" ? .red : .accentColor)
                .disabled(working != nil || !state.hasCloudflareCreds)
                if working == "deploy" { ProgressView().controlSize(.small) }
            }
        }
    }

    // MARK: RUM

    private var rumSection: some View {
        section("Real User Monitoring", symbol: "waveform.path.ecg") {
            if let r = rum, r.success == true {
                Toggle(isOn: Binding(
                    get: { r.enabled ?? false },
                    set: { newValue in Task { await setRUM(enabled: newValue) } }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Collect production telemetry")
                        Text("Sample rate: \(Int((r.sampleRate ?? 0) * 100))%")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .toggleStyle(.switch)
                .disabled(working != nil || !state.hasCloudflareCreds)
                if let url = r.workerUrl {
                    Text(url).font(.caption.monospaced()).foregroundStyle(.secondary)
                }
            } else {
                Label(rum?.error ?? "RUM status unavailable — deploy the worker first.",
                      systemImage: "waveform.path.ecg")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Actions

    private func load() async {
        deployment = try? await state.api.deploymentInfo()
        // RUM state is a local record, not something to ask the engine for.
        if let d = NativeSettings.deployment(projectPath: state.projectPath) {
            rum = RUMStatus(success: true,
                            enabled: d["rumEnabled"] as? Bool ?? false,
                            sampleRate: d["rumSampleRate"] as? Double
                                     ?? (d["rumSampleRate"] as? Int).map(Double.init) ?? 0,
                            workerUrl: d["workerUrl"] as? String,
                            error: nil)
        } else {
            rum = try? await state.api.rumStatus()
        }
    }

    /// Compile the container natively — esbuild driven directly, no engine.
    ///
    /// Output goes to the project's `outDir`, exactly where the engine wrote it,
    /// so the CLI and anything else reading `dist/ytm` are unaffected.
    private func build() async {
        working = "build"
        defer { working = nil }
        let started = Date()
        do {
            let bundles = try await NativeBuilder.buildAndWrite(
                projectPath: state.projectPath,
                containerId: state.containerId
            )
            let total = bundles.reduce(0) { $0 + $1.size }
            let elapsed = Int(Date().timeIntervalSince(started) * 1000)
            let size = ByteCountFormatter.string(fromByteCount: Int64(total), countStyle: .file)
            let rows = bundles
                .map { b in "  " + b.name.padding(toLength: 24, withPad: " ", startingAt: 0)
                          + "\(b.size) bytes" }
                .joined(separator: "\n")
            let dir = NativeBuilder.outputDirectory(projectPath: state.projectPath).path
            buildOutput = "\(bundles.count) bundles · \(size) · \(elapsed) ms\n\n\(rows)\n\n→ \(dir)"
            state.showToast("Built \(bundles.count) bundles")
        } catch {
            buildOutput = "Build failed: \(error.localizedDescription)"
        }
    }

    /// Deploy the container's worker natively — no engine in the path.
    private func deploy() async {
        working = "deploy"
        defer { working = nil }
        do {
            let r = try await NativeDeployer.deploy(
                projectPath: state.projectPath,
                containerId: state.containerId,
                environment: environment,
                accountId: state.settings.cloudflare?.accountId ?? "",
                apiToken: state.settings.cloudflare?.apiToken ?? ""
            )
            let routeLines = r.routes
                .map { "  \($0.pattern.padding(toLength: 34, withPad: " ", startingAt: 0))\($0.status)"
                     + ($0.error.map { e in " — " + e } ?? "") }
                .joined(separator: "\n")
            buildOutput = "Deployed \(r.workerName) to \(environment)"
                + (r.workerUrl.map { "\n\($0)" } ?? "")
                + (routeLines.isEmpty ? "" : "\n\nroutes:\n\(routeLines)")
            state.showToast("Deployed \(r.workerName)")
        } catch {
            state.lastError = error.localizedDescription
            buildOutput = "Deploy failed: \(error.localizedDescription)"
        }
        await load()
    }

    /// Toggle RUM by redeploying with a new sample rate.
    ///
    /// Goes through NativeDeployer so the full binding set from wrangler.toml is
    /// resent. The engine's version sent only RUM_SAMPLE_RATE, which — because
    /// the bindings array replaces everything — removed the TELEMETRY Durable
    /// Object binding and broke the store RUM writes to.
    private func setRUM(enabled: Bool) async {
        working = "rum"
        defer { working = nil }
        let rate = (rum?.sampleRate ?? 0) > 0 ? (rum?.sampleRate ?? 0.05) : 0.05
        do {
            _ = try await NativeDeployer.setRUM(
                projectPath: state.projectPath,
                containerId: state.containerId,
                enabled: enabled,
                sampleRate: rate,
                accountId: state.settings.cloudflare?.accountId ?? "",
                apiToken: state.settings.cloudflare?.apiToken ?? ""
            )
            NativeSettings.updateDeployment(projectPath: state.projectPath, [
                "rumEnabled": enabled,
                "rumSampleRate": enabled ? rate : 0,
                "rumUpdatedAt": ISO8601DateFormatter().string(from: Date()),
            ])
            state.showToast(enabled ? "RUM enabled at \(Int(rate * 100))%" : "RUM disabled")
        } catch {
            state.lastError = error.localizedDescription
        }
        await load()
    }

    private func section(_ title: String, symbol: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: symbol).font(.title3.bold())
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}
