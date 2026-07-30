import SwiftUI

/// The "create it" flow for triggers, variables and zones — the same shape as
/// TagComposerView: a blank draft in the detail pane with an AI panel beside it.
/// Describe what you need, the AI fills in everything, every field stays
/// editable, and Create writes the file.
///
/// Replaces an earlier modal form. A form asks you to already know the answer
/// (which operator? which built-in variable?); this asks what you want.
struct AssetComposerView: View {
    @EnvironmentObject var state: AppState

    let kind: AssetKind
    var onCreated: (String) -> Void
    var onCancel: () -> Void

    @State private var draft = AssetDraft.empty
    @State private var conditions: [AssetCondition] = []
    @State private var prompt = ""
    @State private var busy = false
    @State private var creating = false
    @State private var error: String?
    @State private var history: [String] = []
    @FocusState private var promptFocused: Bool

    private var anthropicKey: String { state.settings.ai?.anthropicApiKey ?? "" }
    private var openaiKey: String { state.settings.ai?.openaiApiKey ?? "" }
    private var hasKey: Bool { !anthropicKey.isEmpty || !openaiKey.isEmpty }

    private var existingNames: [String] { state.project.assets(kind).map(\.id) }
    private var nameTaken: Bool { !draft.name.isEmpty && existingNames.contains(draft.name) }
    private var canCreate: Bool { !draft.name.isEmpty && !creating && !nameTaken }

    /// Variables get the code editor, but only when their type calls for one.
    private var showsCodeEditor: Bool { kind == .variables && draft.type == "javascript" }

    var body: some View {
        VStack(spacing: 0) {
            HSplitView {
                ScrollView {
                    metadataForm.padding(20)
                }
                .frame(minWidth: 380, maxWidth: .infinity, maxHeight: .infinity)

                aiPane
                    .frame(minWidth: 300, idealWidth: 360, maxWidth: 500, maxHeight: .infinity)
                    .padding(.trailing, 20)
                    .padding(.vertical, 20)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            Divider()
            footer
        }
    }

    // MARK: Metadata

    private var metadataForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("New \(kind.singular)", systemImage: "sparkles")
                    .font(.title2.bold())
                    .foregroundStyle(.purple)
                Spacer()
                if !draft.name.isEmpty {
                    Text("yourtm/\(kind.rawValue)/\(draft.name).ts")
                        .font(.caption.monospaced())
                        .foregroundStyle(nameTaken ? .red : .secondary)
                }
            }

            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    fieldLabel("Name")
                    TextField("describe it and AI will name it", text: $draft.name)
                        .textFieldStyle(.roundedBorder)
                        .font(.body.monospaced())
                }
                GridRow {
                    fieldLabel("Description")
                    TextField("", text: $draft.description)
                        .textFieldStyle(.roundedBorder)
                }

                if kind == .triggers {
                    GridRow {
                        fieldLabel("Type")
                        Picker("", selection: $draft.type) {
                            ForEach(PickOptions.triggerTypes, id: \.self) { Text($0).tag($0) }
                        }
                        .labelsHidden().frame(width: 200)
                    }
                }
                if kind == .variables {
                    GridRow {
                        fieldLabel("Type")
                        Picker("", selection: $draft.type) {
                            ForEach(PickOptions.variableTypes, id: \.self) { Text($0).tag($0) }
                        }
                        .labelsHidden().frame(width: 200)
                    }
                    if draft.type == "datalayer" {
                        GridRow {
                            fieldLabel("DataLayer Key")
                            TextField("e.g. contentType", text: $draft.key)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                    if draft.type == "constant" {
                        GridRow {
                            fieldLabel("Value")
                            TextField("", text: $draft.value)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                }
                if kind == .zones {
                    GridRow {
                        fieldLabel("Patterns")
                        TextField("comma-separated, e.g. /blog/*, /news/*",
                                  text: Binding(
                                    get: { draft.patterns.joined(separator: ", ") },
                                    set: { draft.patterns = $0.split(separator: ",")
                                        .map { $0.trimmingCharacters(in: .whitespaces) }
                                        .filter { !$0.isEmpty } }))
                            .textFieldStyle(.roundedBorder)
                    }
                }
                if kind == .triggers || kind == .zones {
                    GridRow(alignment: .top) {
                        fieldLabel("Conditions")
                        ConditionsEditor(conditions: $conditions, project: state.project)
                    }
                }
            }

            if showsCodeEditor {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Code").font(.headline)
                    CodeEditor(text: $draft.code, variables: state.project.variables.map(\.name))
                        .frame(minHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
                }
            }

            if nameTaken {
                Label("A \(kind.singular.lowercased()) named \(draft.name) already exists.",
                      systemImage: "exclamationmark.triangle")
                    .font(.callout).foregroundStyle(.orange)
            }
        }
    }

    // MARK: AI pane

    private var aiPane: some View {
        VStack(spacing: 0) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles").foregroundStyle(.purple)
                Text("Describe your \(kind.singular.lowercased())").font(.headline)
                Spacer()
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    if history.isEmpty && !busy {
                        Text(intro).font(.callout).foregroundStyle(.secondary)
                        Text(examples).font(.caption).foregroundStyle(.tertiary)
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
                            Text("Composing \(kind.singular.lowercased())…")
                                .font(.callout).foregroundStyle(.secondary)
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
                            Text("I need a \(kind.singular.lowercased()) that…")
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
        .onAppear {
            promptFocused = true
            if draft.type.isEmpty {
                draft.type = kind == .triggers ? "pageview" : (kind == .variables ? "datalayer" : "")
            }
        }
    }

    private var intro: String {
        switch kind {
        case .triggers:
            return "Say when tags should fire. The AI names it, picks the event type, and builds the conditions from this container's variables. Everything stays editable."
        case .variables:
            return "Say what value you need. The AI names it, chooses the right type, and fills in the key, value or code."
        case .zones:
            return "Say which pages belong together. The AI names the zone and writes the URL patterns."
        case .tags:
            return ""
        }
    }

    private var examples: String {
        switch kind {
        case .triggers:
            return "**Try:**\n• \"Any blog post about higher education\"\n• \"When a sales-ready form is submitted\"\n• \"Clicks on links in the header\""
        case .variables:
            return "**Try:**\n• \"The order total from the dataLayer\"\n• \"Our GA4 measurement ID as a constant\"\n• \"Whether the page has more than three images\""
        case .zones:
            return "**Try:**\n• \"The checkout funnel\"\n• \"All blog and news pages\""
        case .tags:
            return ""
        }
    }

    private var footer: some View {
        HStack {
            if kind == .triggers, !conditions.isEmpty {
                Label("\(conditions.count) condition\(conditions.count == 1 ? "" : "s") — all must match",
                      systemImage: "line.3.horizontal.decrease.circle")
                    .font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Cancel", action: onCancel)
                .keyboardShortcut(.cancelAction)
            Button(creating ? "Creating…" : "Create \(kind.singular)") {
                create()
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

        // Fold the edited condition rows back into the draft so a refine sees
        // what is actually on screen, not what the AI last returned.
        draft.conditions = conditions.map {
            AssetDraft.DraftCondition(variable: $0.variable, op: $0.op.rawValue, value: $0.value)
        }

        let service = AIService(anthropicKey: anthropicKey, openaiKey: openaiKey)
        do {
            draft = try await service.generateAssetDraft(
                kind: kind,
                request: request,
                draft: draft,
                variables: state.project.variables.map(\.id),
                existingNames: existingNames
            )
            conditions = draft.conditions.map {
                AssetCondition(variable: $0.variable,
                               op: AssetCondition.Operator(rawValue: $0.op) ?? .equals,
                               value: $0.value)
            }
            history.append(request)
            prompt = ""
            promptFocused = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func create() {
        creating = true
        defer { creating = false }
        do {
            try AssetFactory.create(
                kind: kind,
                id: draft.name,
                name: draft.name,
                description: draft.description,
                type: draft.type,
                key: draft.key,
                value: draft.value,
                code: draft.code,
                patterns: draft.patterns,
                conditions: AssetCondition.encode(conditions),
                projectPath: state.projectPath
            )
            let created = draft.name
            Task {
                await state.refresh()
                state.showToast("Created \(created)")
                onCreated(created)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(width: 110, alignment: .trailing)
    }
}
