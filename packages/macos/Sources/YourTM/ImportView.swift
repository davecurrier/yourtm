import SwiftUI
import UniformTypeIdentifiers

/// GTM container import: pick an export, see exactly what's in it, optionally
/// wipe the current container (with backup), then import.
struct ImportView: View {
    @EnvironmentObject var state: AppState

    @State private var preview: GTMPreview?
    @State private var parseError: String?
    @State private var replaceExisting = false
    @State private var confirmReplace = false
    @State private var working: String?
    @State private var result: ImportResult?
    @State private var clearInfo: ClearResult?
    @State private var isTargeted = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let preview {
                    previewCard(preview)
                    optionsCard
                    actionRow(preview)
                } else {
                    dropZone
                }
                if let clearInfo, clearInfo.success == true {
                    backupCard(clearInfo)
                }
                if let result {
                    resultCard(result)
                }
                if let parseError {
                    Label(parseError, systemImage: "exclamationmark.triangle")
                        .font(.callout).foregroundStyle(.orange)
                        .textSelection(.enabled)
                }
            }
            .padding(24)
            .frame(maxWidth: 760, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .navigationTitle("Import")
        .confirmationDialog("Replace the current container?",
                            isPresented: $confirmReplace, titleVisibility: .visible) {
            Button("Back Up and Replace", role: .destructive) {
                Task { await runImport(clearFirst: true) }
            }
        } message: {
            Text("All \(currentAssetCount) existing assets will be removed and replaced by this GTM export. A full backup is saved to .yourtm-backups/ first.")
        }
    }

    private var currentAssetCount: Int {
        state.project.tags.count + state.project.triggers.count
            + state.project.variables.count + state.project.zones.count
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Import from Google Tag Manager").font(.largeTitle).bold()
            Text("Converts a GTM container export into YourTM tags, triggers, and variables.")
                .font(.callout).foregroundStyle(.secondary)
        }
    }

    // MARK: Drop zone

    private var dropZone: some View {
        VStack(spacing: 12) {
            Image(systemName: "arrow.down.doc")
                .font(.system(size: 34))
                .foregroundStyle(.secondary)
            Text("Drop a GTM export here").font(.headline)
            Text("The JSON file from GTM → Admin → Export Container")
                .font(.caption).foregroundStyle(.secondary)
            Button("Choose File…") { chooseFile() }
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 44)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(isTargeted ? Color.accentColor.opacity(0.12) : Color.secondary.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(isTargeted ? Color.accentColor : Color.secondary.opacity(0.35),
                              style: StrokeStyle(lineWidth: 1.5, dash: [6]))
        )
        .onDrop(of: [.fileURL], isTargeted: $isTargeted) { providers in
            guard let provider = providers.first else { return false }
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                if let url { DispatchQueue.main.async { load(url) } }
            }
            return true
        }
    }

    // MARK: Preview

    private func previewCard(_ p: GTMPreview) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.containerName).font(.title3.bold())
                    Text("\(p.containerId) · \(p.fileName)")
                        .font(.caption.monospaced()).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Choose a different file") { reset() }
                    .controlSize(.small)
            }
            Divider()
            HStack(spacing: 26) {
                stat("Tags", p.tags, "tag", .purple)
                stat("Triggers", p.triggers, "bolt", .orange)
                stat("Variables", p.variables, "curlybraces", .teal)
                stat("Built-in vars", p.builtInVariables, "shippingbox", .secondary)
            }
            if !p.tagTypes.isEmpty {
                Text("Tag types").font(.caption.bold()).foregroundStyle(.secondary)
                    .padding(.top, 2)
                FlowLayout(spacing: 5) {
                    ForEach(p.tagTypes, id: \.0) { type, count in
                        Text("\(type) × \(count)")
                            .font(.caption)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(.quaternary.opacity(0.7), in: Capsule())
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func stat(_ label: String, _ value: Int, _ symbol: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label("\(value)", systemImage: symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(tint)
                .monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    // MARK: Options

    private var optionsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Toggle(isOn: $replaceExisting) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Replace the current container")
                    Text("Removes all \(currentAssetCount) existing assets first. A backup is saved to .yourtm-backups/ before anything is deleted.")
                        .font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .toggleStyle(.switch)
            if !replaceExisting {
                Label("Imported assets with matching names will overwrite existing ones; anything else is left in place.",
                      systemImage: "info.circle")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func actionRow(_ p: GTMPreview) -> some View {
        HStack {
            if let working {
                ProgressView().controlSize(.small)
                Text(working).font(.callout).foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                if replaceExisting {
                    confirmReplace = true
                } else {
                    Task { await runImport(clearFirst: false) }
                }
            } label: {
                Label(replaceExisting ? "Replace and Import" : "Import",
                      systemImage: "square.and.arrow.down")
            }
            .buttonStyle(.borderedProminent)
            .tint(replaceExisting ? .red : .accentColor)
            .disabled(working != nil)
        }
    }

    // MARK: Results

    private func backupCard(_ c: ClearResult) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "clock.arrow.circlepath").foregroundStyle(.blue)
            VStack(alignment: .leading, spacing: 1) {
                Text("Backed up \(c.total ?? 0) assets").font(.callout.weight(.medium))
                Text(c.backupPath ?? "").font(.caption.monospaced()).foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
            Spacer()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }

    private func resultCard(_ r: ImportResult) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(r.success == true ? "Import complete" : "Import failed",
                  systemImage: r.success == true ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.headline)
                .foregroundStyle(r.success == true ? .green : .red)

            if let i = r.imported {
                HStack(spacing: 26) {
                    stat("Tags", i.tags ?? 0, "tag", .purple)
                    stat("Triggers", i.triggers ?? 0, "bolt", .orange)
                    stat("Variables", i.variables ?? 0, "curlybraces", .teal)
                    stat("Zones", i.zones ?? 0, "square.grid.2x2", .indigo)
                }
            }
            if let s = r.skipped,
               (s.tags ?? 0) + (s.triggers ?? 0) + (s.variables ?? 0) > 0 {
                Text("Skipped — unsupported types: \(s.tags ?? 0) tags, \(s.triggers ?? 0) triggers, \(s.variables ?? 0) variables")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let w = r.warnings, !w.isEmpty {
                DisclosureGroup("\(w.count) warnings") {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Array(w.enumerated()), id: \.offset) { _, msg in
                            Text("• \(msg)").font(.caption).foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.top, 4)
                }
                .font(.callout)
            }
            if let e = r.errors, !e.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    ForEach(Array(e.enumerated()), id: \.offset) { _, msg in
                        Label(msg, systemImage: "exclamationmark.triangle")
                            .font(.caption).foregroundStyle(.orange)
                    }
                }
            }
            if let err = r.error {
                Text(err).font(.caption).foregroundStyle(.red).textSelection(.enabled)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: Actions

    private func chooseFile() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.json]
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { load(url) }
    }

    private func load(_ url: URL) {
        parseError = nil
        result = nil
        clearInfo = nil
        do {
            let raw = try String(contentsOf: url, encoding: .utf8)
            guard let data = raw.data(using: .utf8),
                  let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let cv = root["containerVersion"] as? [String: Any] else {
                parseError = "That doesn't look like a GTM container export (no containerVersion)."
                return
            }
            let container = cv["container"] as? [String: Any] ?? [:]
            let tags = cv["tag"] as? [[String: Any]] ?? []

            var typeCounts: [String: Int] = [:]
            for t in tags {
                let type = (t["type"] as? String) ?? "unknown"
                typeCounts[type, default: 0] += 1
            }

            preview = GTMPreview(
                containerId: (container["publicId"] as? String) ?? "unknown",
                containerName: (container["name"] as? String) ?? url.lastPathComponent,
                tags: tags.count,
                triggers: (cv["trigger"] as? [[String: Any]])?.count ?? 0,
                variables: (cv["variable"] as? [[String: Any]])?.count ?? 0,
                builtInVariables: (cv["builtInVariable"] as? [[String: Any]])?.count ?? 0,
                tagTypes: typeCounts.sorted { $0.value > $1.value }.map { ($0.key, $0.value) },
                fileName: url.lastPathComponent,
                rawJSON: raw
            )
        } catch {
            parseError = "Couldn't read the file: \(error.localizedDescription)"
        }
    }

    private func reset() {
        preview = nil
        result = nil
        clearInfo = nil
        parseError = nil
    }

    private func runImport(clearFirst: Bool) async {
        guard let preview else { return }
        result = nil
        do {
            if clearFirst {
                working = "Backing up and clearing…"
                let cleared = try await state.api.clearContainer()
                if cleared.success != true {
                    parseError = cleared.error ?? "Clear failed"
                    working = nil
                    return
                }
                clearInfo = cleared
            }
            working = "Importing…"
            let r = try await state.api.importGTM(json: preview.rawJSON)
            result = r
            working = nil
            await state.refresh()
            if r.success == true {
                let n = (r.imported?.tags ?? 0) + (r.imported?.triggers ?? 0)
                    + (r.imported?.variables ?? 0)
                state.showToast("Imported \(n) assets")
            }
        } catch {
            parseError = error.localizedDescription
            working = nil
        }
    }
}
