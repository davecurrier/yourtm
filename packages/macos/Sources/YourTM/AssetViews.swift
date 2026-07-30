import SwiftUI

// MARK: - Asset list

struct AssetListView: View {
    @EnvironmentObject var state: AppState
    let kind: AssetKind
    @State private var search = ""
    @State private var selectedId: String?
    @State private var composing = false
    @State private var pendingDelete: Asset?
    @State private var creating = false

    private var assets: [Asset] {
        let all = state.project.assets(kind).sorted { $0.name < $1.name }
        guard !search.isEmpty else { return all }
        return all.filter {
            $0.name.localizedCaseInsensitiveContains(search)
                || ($0.description ?? "").localizedCaseInsensitiveContains(search)
                || ($0.type ?? "").localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        HSplitView {
            List(assets, selection: $selectedId) { asset in
                AssetRow(kind: kind, asset: asset)
                    .tag(asset.id)
                    .contextMenu {
                        Button("Delete \(asset.name)…", systemImage: "trash", role: .destructive) {
                            pendingDelete = asset
                        }
                    }
            }
            .frame(minWidth: 300, idealWidth: 340, maxWidth: 460)
            .searchable(text: $search, placement: .sidebar, prompt: "Filter \(kind.title.lowercased())")
            .onAppear {
                if selectedId == nil { selectedId = assets.first?.id }
            }

            Group {
                if composing && kind == .tags {
                    TagComposerView(
                        onCreated: { newId in
                            composing = false
                            selectedId = newId
                        },
                        onCancel: { composing = false }
                    )
                } else if let id = selectedId, let asset = assets.first(where: { $0.id == id }) {
                    AssetDetailView(kind: kind, asset: asset, onRequestDelete: { pendingDelete = asset })
                        .id(id) // reset editor state when switching assets
                } else {
                    ContentUnavailableView(
                        "No \(kind.singular) Selected",
                        systemImage: kind.systemImage,
                        description: Text("Select a \(kind.singular.lowercased()) from the list.")
                    )
                }
            }
            .frame(minWidth: 420, maxWidth: .infinity, maxHeight: .infinity)
        }
        .navigationTitle(kind.title)
        .toolbar {
            Button {
                if kind == .tags {
                    selectedId = nil
                    composing = true
                } else {
                    creating = true
                }
            } label: {
                Label("New \(kind.singular)", systemImage: "plus")
            }
            .help(kind == .tags
                  ? "Describe a tag and let AI compose it"
                  : "Create a new \(kind.singular.lowercased())")
            Button {
                Task { await state.refresh() }
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
        }
        .onChange(of: selectedId) { _, newValue in
            // Picking a tag from the list exits composer mode
            if newValue != nil { composing = false }
        }
        .sheet(isPresented: $creating) {
            NewAssetView(
                kind: kind,
                onCreated: { newId in
                    creating = false
                    selectedId = newId
                },
                onCancel: { creating = false }
            )
            .environmentObject(state)
        }
        .sheet(item: $pendingDelete) { asset in
            DeleteConfirmView(asset: asset, kind: kind) {
                if selectedId == asset.id { selectedId = nil }
            }
            .environmentObject(state)
        }
    }
}

struct AssetRow: View {
    let kind: AssetKind
    let asset: Asset

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(asset.name).font(.body.weight(.medium)).lineLimit(1)
                Spacer()
                if let type = asset.type {
                    Text(type)
                        .font(.caption2)
                        .padding(.horizontal, 6).padding(.vertical, 1)
                        .background(.quaternary, in: Capsule())
                }
            }
            if let desc = asset.description, !desc.isEmpty {
                Text(desc).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            if kind == .tags, !asset.triggers.isEmpty {
                HStack(spacing: 4) {
                    Image(systemName: "bolt").font(.caption2)
                    Text(asset.triggers.joined(separator: ", "))
                        .font(.caption2)
                        .lineLimit(1)
                }
                .foregroundStyle(.orange)
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Code dedenting
// Tag code is stored as an indented template literal (leading newline +
// the .ts file's indentation). Strip that for editing; save the clean form.

extension String {
    var dedented: String {
        var lines = components(separatedBy: "\n")
        while let first = lines.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
            lines.removeFirst()
        }
        while let last = lines.last, last.trimmingCharacters(in: .whitespaces).isEmpty {
            lines.removeLast()
        }
        let indents = lines
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { $0.prefix { $0 == " " }.count }
        guard let minIndent = indents.min(), minIndent > 0 else {
            return lines.joined(separator: "\n")
        }
        return lines
            .map { String($0.count >= minIndent ? String($0.dropFirst(minIndent)) : $0) }
            .joined(separator: "\n")
    }
}

// MARK: - Asset detail

struct AssetDetailView: View {
    @EnvironmentObject var state: AppState
    let kind: AssetKind
    let asset: Asset
    var onRequestDelete: () -> Void = {}

    @State private var name: String = ""
    @State private var descriptionText: String = ""
    @State private var code: String = ""
    @State private var triggersSel: [String] = []
    @State private var blockingSel: [String] = []
    @State private var zonesSel: [String] = []
    @State private var consentSel: [String] = []
    @State private var patternsText: String = ""
    @State private var valueText: String = ""
    @State private var typeText: String = ""
    @State private var eventText: String = ""
    @State private var selectorText: String = ""
    @State private var keyText: String = ""
    @State private var conditions: [AssetCondition] = []
    @State private var saving = false
    @State private var loaded = false
    @State private var showAI = false

    private var hasChanges: Bool {
        name != asset.name
            || descriptionText != (asset.description ?? "")
            || code != (asset.code ?? "").dedented
            || triggersSel != asset.triggers
            || blockingSel != asset.blocking
            || zonesSel != asset.zones
            || consentSel != asset.consent
            || patternsText != asset.patterns.joined(separator: ", ")
            || valueText != (asset.value ?? "")
            || typeText != (asset.type ?? "")
            || eventText != (asset.event ?? "")
            || selectorText != (asset.selector ?? "")
            || keyText != (asset.key ?? "")
            || conditions != AssetCondition.list(from: asset.extra["conditions"])
    }

    private var hasCode: Bool { asset.code != nil || kind == .tags }

    var body: some View {
        VStack(spacing: 0) {
            if hasCode {
                // Fixed metadata on top, code editor fills the rest down to the footer
                VStack(alignment: .leading, spacing: 16) {
                    metadataForm
                    if !asset.extra.isEmpty {
                        DisclosureGroup("Other Properties") { extraSection }
                            .font(.callout)
                    }
                }
                .padding(20)
                codeSection
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        metadataForm
                        if !asset.extra.isEmpty {
                            extraSection
                        }
                    }
                    .padding(20)
                }
            }
            Divider()
            footer
        }
        .onAppear { load() }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        name = asset.name
        descriptionText = asset.description ?? ""
        code = (asset.code ?? "").dedented
        triggersSel = asset.triggers
        blockingSel = asset.blocking
        zonesSel = asset.zones
        consentSel = asset.consent
        patternsText = asset.patterns.joined(separator: ", ")
        valueText = asset.value ?? ""
        typeText = asset.type ?? ""
        eventText = asset.event ?? ""
        selectorText = asset.selector ?? ""
        keyText = asset.key ?? ""
        conditions = AssetCondition.list(from: asset.extra["conditions"])
    }

    /// Source file shown beside the title. Derived when the engine omits
    /// sourcePath, which it does for every kind except tags.
    private var sourceLabel: String {
        asset.sourcePath ?? "yourtm/\(kind.rawValue)/\(asset.id).ts"
    }

    private var metadataForm: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                // Editable: `name` is a standard property for every kind, and
                // its @State was previously never bound to a control, so
                // hasChanges compared against a value that could never change.
                TextField("", text: $name)
                    .textFieldStyle(.plain)
                    .font(.title2.bold())
                    .frame(maxWidth: 320)
                Spacer()
                Text(sourceLabel).font(.caption.monospaced()).foregroundStyle(.secondary)
            }

            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow {
                    fieldLabel("Description")
                    TextField("", text: $descriptionText)
                        .textFieldStyle(.roundedBorder)
                }
                if kind == .tags {
                    GridRow {
                        fieldLabel("Triggers")
                        MultiPickerField(selection: $triggersSel,
                                         options: PickOptions.triggers(state.project),
                                         placeholder: "choose triggers")
                    }
                    GridRow {
                        fieldLabel("Blocking")
                        MultiPickerField(selection: $blockingSel,
                                         options: PickOptions.triggers(state.project),
                                         placeholder: "no blocking triggers")
                    }
                    GridRow {
                        fieldLabel("Zones")
                        MultiPickerField(selection: $zonesSel,
                                         options: PickOptions.zones(state.project),
                                         placeholder: "choose zones")
                    }
                    GridRow {
                        fieldLabel("Consent")
                        MultiPickerField(selection: $consentSel,
                                         options: PickOptions.consent,
                                         placeholder: "no consent gating")
                    }
                }
                if kind == .zones {
                    GridRow {
                        fieldLabel("Patterns")
                        TextField("comma-separated URL patterns", text: $patternsText)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                if kind == .variables, typeText == "constant" {
                    GridRow {
                        fieldLabel("Value")
                        TextField("", text: $valueText)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                if kind == .triggers {
                    GridRow {
                        fieldLabel("Type")
                        Picker("", selection: $typeText) {
                            ForEach(PickOptions.triggerTypes, id: \.self) { Text($0).tag($0) }
                            if !PickOptions.triggerTypes.contains(typeText) {
                                Text(typeText.isEmpty ? "—" : typeText).tag(typeText)
                            }
                        }
                        .labelsHidden()
                        .frame(width: 200)
                    }
                    // Only shown where the type gives them meaning: a pageview
                    // trigger has no event name and no element to select, and
                    // offering the fields invites writing dead properties.
                    if typeText == "customEvent" {
                        GridRow {
                            fieldLabel("Event")
                            TextField("dataLayer event name", text: $eventText)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                    if typeText == "click" || typeText == "formSubmit" {
                        GridRow {
                            fieldLabel("Selector")
                            TextField("CSS selector", text: $selectorText)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                }
                if kind == .variables {
                    GridRow {
                        fieldLabel("Type")
                        Picker("", selection: $typeText) {
                            ForEach(PickOptions.variableTypes, id: \.self) { Text($0).tag($0) }
                            if !PickOptions.variableTypes.contains(typeText) {
                                Text(typeText.isEmpty ? "—" : typeText).tag(typeText)
                            }
                        }
                        .labelsHidden()
                        .frame(width: 200)
                    }
                    // A variable's substance depends on its type: datalayer uses
                    // a key, constant a value, javascript the code editor below.
                    if typeText == "datalayer" {
                        GridRow {
                            fieldLabel("DataLayer Key")
                            TextField("dataLayer key", text: $keyText)
                                .textFieldStyle(.roundedBorder)
                        }
                    }
                }
                if kind == .triggers || kind == .zones {
                    GridRow(alignment: .top) {
                        fieldLabel("Conditions")
                        ConditionsEditor(conditions: $conditions, project: state.project)
                    }
                }
            }
        }
    }

    private var codeSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("Code").font(.headline)
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { showAI.toggle() }
                } label: {
                    Label(showAI ? "Hide AI" : "Help me", systemImage: "sparkles")
                }
                .tint(.purple)
                .help("Ask AI to write or modify this tag's code")
            }
            HSplitView {
                CodeEditor(text: $code, variables: state.project.variables.map(\.name))
                    .frame(minWidth: 320, maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
                if showAI {
                    AIAssistPanel(code: $code, tagName: asset.name, triggers: asset.triggers)
                        .frame(minWidth: 280, idealWidth: 340, maxWidth: 480, maxHeight: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.quaternary))
                        .padding(.leading, 8)
                }
            }
        }
    }

    private var extraSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Other Properties").font(.headline)
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 12, verticalSpacing: 6) {
                ForEach(asset.extra.keys.sorted().filter { $0 != "conditions" }, id: \.self) { key in
                    GridRow {
                        fieldLabel(key)
                        Text(asset.extra[key]?.displayString ?? "")
                            .font(.callout.monospaced())
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Button(role: .destructive) {
                onRequestDelete()
            } label: {
                Image(systemName: "trash")
            }
            .buttonStyle(.borderless)
            .foregroundStyle(.secondary)
            .help("Delete \(asset.name)")

            externalEditorControls

            if hasChanges {
                Label("Unsaved changes", systemImage: "pencil.circle")
                    .font(.callout)
                    .foregroundStyle(.orange)
            }
            Spacer()
            Button("Revert") {
                loaded = false
                load()
            }
            .disabled(!hasChanges || saving)

            Button(saving ? "Saving…" : "Save") {
                Task { await save() }
            }
            .keyboardShortcut("s", modifiers: .command)
            .buttonStyle(.borderedProminent)
            .disabled(!hasChanges || saving)
        }
        .padding(12)
        .background(.bar)
    }

    /// Open this asset's source in an external editor, or reveal it in Finder.
    ///
    /// Hidden entirely when the engine reported no `sourcePath` — a menu whose
    /// every item fails is worse than no menu.
    @ViewBuilder
    private var externalEditorControls: some View {
        if let fileURL = EditorService.fileURL(for: asset, projectPath: state.projectPath) {
            let editors = EditorService.available(for: fileURL)
            Menu {
                if let preferred = EditorService.effective(for: fileURL) {
                    Button("Edit in \(preferred.name)") { EditorService.open(fileURL, using: preferred) }
                }
                if editors.count > 1 {
                    Divider()
                    Menu("Open With") {
                        ForEach(editors) { editor in
                            Button(editor.name) {
                                // Choosing explicitly also sets the default.
                                EditorService.preferred = editor
                                EditorService.open(fileURL, using: editor)
                            }
                        }
                    }
                }
                Divider()
                Button("Reveal in Finder") { EditorService.revealInFinder(fileURL) }
                Button("Copy Path") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(fileURL.path, forType: .string)
                }
            } label: {
                Image(systemName: "arrow.up.forward.app")
            }
            .menuStyle(.borderlessButton)
            .fixedSize()
            .foregroundStyle(.secondary)
            .help(hasChanges
                  ? "Open \(asset.sourcePath ?? "source") externally — save first, the file on disk does not have your unsaved edits"
                  : "Open \(asset.sourcePath ?? "source") in an external editor")
        }
    }

    private func save() async {
        saving = true
        defer { saving = false }

        var updates: [String: Any] = [:]
        if descriptionText != (asset.description ?? "") { updates["description"] = descriptionText }
        if code != (asset.code ?? "").dedented { updates["code"] = code }
        if triggersSel != asset.triggers { updates["triggers"] = triggersSel }
        if blockingSel != asset.blocking { updates["blocking"] = blockingSel }
        if zonesSel != asset.zones { updates["zones"] = zonesSel }
        if consentSel != asset.consent { updates["consent"] = consentSel }
        if patternsText != asset.patterns.joined(separator: ", ") {
            updates["patterns"] = patternsText
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
        }
        if valueText != (asset.value ?? "") { updates["value"] = valueText }
        if name != asset.name { updates["name"] = name }
        if typeText != (asset.type ?? "") { updates["type"] = typeText }
        if eventText != (asset.event ?? "") { updates["event"] = eventText }
        if selectorText != (asset.selector ?? "") { updates["selector"] = selectorText }
        if keyText != (asset.key ?? "") { updates["key"] = keyText }
        if conditions != AssetCondition.list(from: asset.extra["conditions"]) {
            updates["conditions"] = AssetCondition.encode(conditions)
        }

        guard !updates.isEmpty else { return }
        _ = await state.saveAsset(kind: kind, id: asset.id, updates: updates)
    }

    private func fieldLabel(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .frame(width: 110, alignment: .trailing)
    }
}

