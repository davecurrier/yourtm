import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var state: AppState

    @State private var projectPath = ""
    @State private var accountId = ""
    @State private var apiToken = ""
    @State private var anthropicKey = ""
    @State private var openaiKey = ""
    @State private var saving = false
    /// Same UserDefaults key EditorService reads, so the picker and the
    /// footer menu can never disagree about the chosen editor.
    @AppStorage("externalEditorPath") private var editorPath = ""
    @State private var loaded = false

    var body: some View {
        Form {
            Section("Project") {
                HStack {
                    TextField("Project path", text: $projectPath)
                        .font(.body.monospaced())
                    Button("Choose…") { choosePath() }
                }
                LabeledContent("Container", value: state.containerId)
            }

            Section("Cloudflare") {
                TextField("Account ID", text: $accountId)
                    .font(.body.monospaced())
                SecureField("API Token", text: $apiToken)
                Text("Required for Deploy and the RUM toggle. Stored in ~/.yourtm/config.json.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("AI Assist") {
                SecureField("Anthropic API Key (sk-ant-…)", text: $anthropicKey)
                SecureField("OpenAI API Key (sk-…)", text: $openaiKey)
                Text("Powers the \"Help me\" panel in the tag code editor. Anthropic (claude-opus-5) is used when set; otherwise OpenAI. Paste the secret key itself, not its name.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if !anthropicKey.isEmpty && !anthropicKey.hasPrefix("sk-ant") {
                    Label("This doesn't look like an Anthropic key — they start with sk-ant-.",
                          systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }

            Section("External Editor") {
                let editors = EditorService.available()
                if editors.isEmpty {
                    Label("No text editor found that opens .ts files.", systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                } else {
                    Picker("Open sources in", selection: $editorPath) {
                        Text("Automatic (\(editors.first?.name ?? "none"))").tag("")
                        ForEach(editors) { editor in
                            Text(editor.name).tag(editor.url.path)
                        }
                    }
                    .onChange(of: editorPath) { _, newValue in
                        EditorService.preferred = newValue.isEmpty
                            ? nil
                            : EditorService.Editor(url: URL(fileURLWithPath: newValue))
                    }
                }
                Text("macOS registers .ts as an MPEG-2 video stream, so the system default for a tag file can be a video player. Only apps that also handle text or source code are offered here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Spacer()
                Button(saving ? "Saving…" : "Save Settings") {
                    Task { await save() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(saving)
            }
        }
        .formStyle(.grouped)
        .navigationTitle("Settings")
        .onAppear { load() }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        projectPath = state.projectPath
        accountId = state.settings.cloudflare?.accountId ?? ""
        apiToken = state.settings.cloudflare?.apiToken ?? ""
        anthropicKey = state.settings.ai?.anthropicApiKey ?? ""
        openaiKey = state.settings.ai?.openaiApiKey ?? ""
    }

    private func choosePath() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = URL(fileURLWithPath: projectPath.isEmpty
            ? NSHomeDirectory() : projectPath)
        if panel.runModal() == .OK, let url = panel.url {
            projectPath = url.path
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }

        if projectPath != state.projectPath, !projectPath.isEmpty {
            do {
                try NativeSettings.setProject(path: projectPath)
            } catch {
                state.lastError = error.localizedDescription
                return
            }
        }

        var cloudflare: [String: Any] = [:]
        if !accountId.isEmpty { cloudflare["accountId"] = accountId }
        if !apiToken.isEmpty { cloudflare["apiToken"] = apiToken }
        var ai: [String: Any] = [:]
        // Auto-correct: an OpenAI-style key pasted into the Anthropic field
        if !anthropicKey.isEmpty && !anthropicKey.hasPrefix("sk-ant") && anthropicKey.hasPrefix("sk-") {
            openaiKey = anthropicKey
            anthropicKey = ""
        }
        if !anthropicKey.isEmpty { ai["anthropicApiKey"] = anthropicKey }
        if !openaiKey.isEmpty { ai["openaiApiKey"] = openaiKey }
        if !ai.isEmpty {
            ai["provider"] = anthropicKey.isEmpty ? "openai" : "anthropic"
        }
        do {
            try NativeSettings.save(cloudflare: cloudflare, ai: ai)
        } catch {
            state.lastError = "Could not save settings: \(error.localizedDescription)"
            return
        }

        await state.refresh()
        state.showToast("Settings saved")
    }
}
