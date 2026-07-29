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
        rum = try? await state.api.rumStatus()
    }

    private func build() async {
        working = "build"
        defer { working = nil }
        do {
            let data = try await state.api.build()
            if let pretty = try? JSONSerialization.jsonObject(with: data),
               let str = try? JSONSerialization.data(withJSONObject: pretty, options: [.prettyPrinted]) {
                buildOutput = String(data: str, encoding: .utf8)
            } else {
                buildOutput = String(data: data, encoding: .utf8)
            }
            state.showToast("Build finished")
        } catch {
            buildOutput = "Build failed: \(error.localizedDescription)"
        }
    }

    private func deploy() async {
        working = "deploy"
        defer { working = nil }
        do {
            let result = try await state.api.deploy(environment: environment)
            if result.success == false {
                state.lastError = result.error ?? "Deploy failed"
            } else {
                state.showToast("Deployed")
            }
        } catch {
            state.lastError = error.localizedDescription
        }
        await load()
    }

    private func setRUM(enabled: Bool) async {
        working = "rum"
        defer { working = nil }
        _ = try? await state.api.setRUM(enabled: enabled, sampleRate: rum?.sampleRate ?? 1.0)
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
