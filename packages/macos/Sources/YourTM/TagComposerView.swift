import SwiftUI

/// The "create it" flow: a draft tag screen where the user describes what they
/// need and the AI fills in EVERYTHING — name, description, triggers, zones,
/// consent, and code. All fields stay editable; Create writes the file.
struct TagComposerView: View {
    @EnvironmentObject var state: AppState

    var onCreated: (String) -> Void
    var onCancel: () -> Void

    @State private var draft = TagDraft.empty
    @State private var prompt = ""
    @State private var busy = false
    @State private var creating = false
    @State private var error: String?
    @State private var history: [String] = []
    @FocusState private var promptFocused: Bool

    private var anthropicKey: String { state.settings.ai?.anthropicApiKey ?? "" }
    private var openaiKey: String { state.settings.ai?.openaiApiKey ?? "" }
    private var hasKey: Bool { !anthropicKey.isEmpty || !openaiKey.isEmpty }
    private var canCreate: Bool {
        !draft.name.isEmpty && !draft.code.isEmpty && !creating
    }

    var body: some View {
        VStack(spacing: 0) {
            metadataForm
            // Same structure as the tag editor: header row above the split so
            // the code editor and AI panel tops align.
            VStack(alignment: .leading, spacing: 6) {
                Text("Code").font(.headline)
                HSplitView {
                    CodeEditor(text: $draft.code, variables: state.project.variables.map(\.name))
                        .frame(minWidth: 320, maxWidth: .infinity, maxHeight: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
                    aiPane
                        .frame(minWidth: 300, idealWidth: 360, maxWidth: 500, maxHeight: .infinity)
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            footer
        }
    }

    // MARK: Metadata

    private var metadataForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("New Tag", systemImage: "sparkles")
                    .font(.title2.bold())
                    .foregroundStyle(.purple)
                Spacer()
                if !draft.name.isEmpty {
                    Text("yourtm/tags/\(draft.name).ts")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
            }
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    fieldLabel("Name")
                    TextField("describe the tag and AI will name it", text: $draft.name)
                        .textFieldStyle(.roundedBorder)
                        .font(.body.monospaced())
                }
                GridRow {
                    fieldLabel("Description")
                    TextField("", text: $draft.description)
                        .textFieldStyle(.roundedBorder)
                }
                GridRow {
                    fieldLabel("Triggers")
                    MultiPickerField(selection: $draft.triggers,
                                     options: PickOptions.triggers(state.project),
                                     placeholder: "choose triggers")
                }
                GridRow {
                    fieldLabel("Zones")
                    MultiPickerField(selection: $draft.zones,
                                     options: PickOptions.zones(state.project),
                                     placeholder: "choose zones")
                }
                GridRow {
                    fieldLabel("Consent")
                    MultiPickerField(selection: $draft.consent,
                                     options: PickOptions.consent,
                                     placeholder: "no consent gating")
                }
            }
        }
        .padding(20)
    }

    // MARK: AI pane

    private var aiPane: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").foregroundStyle(.purple)
                Text("Describe your tag").font(.headline)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if history.isEmpty && !busy {
                        Text("Say what you need — the AI names the tag, picks triggers and zones from this container, sets consent, and writes the code. Everything stays editable.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                        Text("**Try:**\n• \"Hotjar tracking for the higher-ed pages\"\n• \"LinkedIn conversion when a sales-ready form is submitted\"\n• \"Log {{page-url}} to the console on every page\"")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    ForEach(Array(history.enumerated()), id: \.offset) { _, h in
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green).font(.caption).padding(.top, 2)
                            Text(h).font(.callout)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(8)
                        .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 6))
                    }
                    if busy {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Composing tag…").font(.callout).foregroundStyle(.secondary)
                        }
                    }
                    if let error {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.caption).foregroundStyle(.orange)
                            .textSelection(.enabled)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()

            VStack(alignment: .leading, spacing: 8) {
                if !hasKey {
                    Label("Add an API key in Settings to enable AI.", systemImage: "key")
                        .font(.caption).foregroundStyle(.orange)
                }
                TextEditor(text: $prompt)
                    .font(.body)
                    .focused($promptFocused)
                    .frame(minHeight: 54, maxHeight: 110)
                    .scrollContentBackground(.hidden)
                    .padding(6)
                    .background(.background, in: RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.quaternary))
                    .overlay(alignment: .topLeading) {
                        if prompt.isEmpty {
                            Text("I need a tag that…")
                                .foregroundStyle(.tertiary)
                                .padding(.horizontal, 10).padding(.vertical, 8)
                                .allowsHitTesting(false)
                        }
                    }
                HStack {
                    Text("⌘⏎ to send").font(.caption2).foregroundStyle(.tertiary)
                    Spacer()
                    Button {
                        Task { await compose() }
                    } label: {
                        Label(history.isEmpty ? "Compose" : "Refine", systemImage: "sparkles")
                    }
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .disabled(busy || !hasKey
                              || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(12)
        }
        .background(.quaternary.opacity(0.3))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
        .padding(.leading, 8)
        .onAppear { promptFocused = true }
    }

    private var footer: some View {
        HStack {
            if !draft.name.isEmpty && draft.code.isEmpty {
                Label("No code yet", systemImage: "exclamationmark.circle")
                    .font(.callout).foregroundStyle(.orange)
            }
            Spacer()
            Button("Cancel", action: onCancel)
                .keyboardShortcut(.cancelAction)
            Button(creating ? "Creating…" : "Create Tag") {
                Task { await create() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(!canCreate)
        }
        .padding(12)
        .background(.bar)
    }

    // MARK: Actions

    private func compose() async {
        let request = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !request.isEmpty else { return }
        busy = true
        error = nil
        defer { busy = false }

        let triggerInfo = state.project.triggers.map { t in
            "- \(t.name)\(t.type.map { " (\($0))" } ?? "")\(t.description.map { " — \($0)" } ?? "")"
        }
        let zoneInfo = state.project.zones.map { z in
            "- \(z.name)\(z.description.map { " — \($0)" } ?? "")"
        }

        let service = AIService(anthropicKey: anthropicKey, openaiKey: openaiKey)
        do {
            draft = try await service.generateTagDraft(
                request: request,
                draft: draft,
                triggerInfo: triggerInfo,
                zoneInfo: zoneInfo,
                variables: state.project.variables.map(\.name)
            )
            history.append(request)
            prompt = ""
            promptFocused = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func create() async {
        creating = true
        defer { creating = false }
        do {
            var config: [String: Any] = [
                "name": draft.name,
                "description": draft.description.isEmpty ? draft.name : draft.description,
                "triggers": draft.triggers.isEmpty ? ["all-pages"] : draft.triggers,
                "zones": draft.zones.isEmpty ? ["global"] : draft.zones,
                "code": draft.code,
            ]
            if !draft.consent.isEmpty { config["consent"] = draft.consent }

            let result = try await state.api.createAsset(type: "tag", template: "custom-code", config: config)
            if result.success == false {
                error = result.error ?? "Create failed"
                return
            }
            await state.refresh()
            state.showToast("Created \(draft.name)")
            onCreated(result.id ?? draft.name)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Helpers

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(width: 110, alignment: .trailing)
    }
}
