import SwiftUI

/// Creates a trigger, variable or zone.
///
/// Tags go through TagComposerView, which is AI-driven and code-centric. The
/// other three kinds are small declarative records, so they get a plain form.
/// The compiler discovers assets by globbing `yourtm/<kind>/**/*.ts`, so writing
/// a well-formed file is the whole job — there is no registry to update.
struct NewAssetView: View {
    let kind: AssetKind
    var onCreated: (String) -> Void
    var onCancel: () -> Void

    @EnvironmentObject var state: AppState

    @State private var name = ""
    @State private var descriptionText = ""
    @State private var typeText = ""
    @State private var keyText = ""
    @State private var valueText = ""
    @State private var patternsText = ""
    @State private var error: String?
    @State private var working = false

    /// File name and asset id. Matches the existing container's convention.
    private var slug: String {
        let lowered = name.lowercased()
        let mapped = lowered.map { ch -> Character in
            ch.isLetter || ch.isNumber ? ch : "-"
        }
        // Collapse runs of separators and trim them from the ends.
        let collapsed = String(mapped)
            .split(separator: "-", omittingEmptySubsequences: true)
            .joined(separator: "-")
        return collapsed
    }

    private var alreadyExists: Bool {
        !slug.isEmpty && AssetFactory.fileURL(kind: kind, id: slug, projectPath: state.projectPath) != nil
    }

    private var canCreate: Bool {
        !slug.isEmpty && !working && !alreadyExists && !state.projectPath.isEmpty
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("New \(kind.singular)").font(.title2.bold())

            Form {
                TextField("Name", text: $name, prompt: Text("e.g. checkout-page"))
                TextField("Description", text: $descriptionText, prompt: Text("optional"))

                if kind == .triggers {
                    Picker("Type", selection: $typeText) {
                        ForEach(PickOptions.triggerTypes, id: \.self) { Text($0).tag($0) }
                    }
                }
                if kind == .variables {
                    Picker("Type", selection: $typeText) {
                        ForEach(PickOptions.variableTypes, id: \.self) { Text($0).tag($0) }
                    }
                    if typeText == "datalayer" {
                        TextField("DataLayer Key", text: $keyText, prompt: Text("e.g. contentType"))
                    }
                    if typeText == "constant" {
                        TextField("Value", text: $valueText)
                    }
                }
                if kind == .zones {
                    TextField("URL Patterns", text: $patternsText,
                              prompt: Text("comma-separated, e.g. /blog/*, /news/*"))
                }
            }
            .formStyle(.grouped)

            if !slug.isEmpty {
                Text(verbatim: "yourtm/\(kind.rawValue)/\(slug).ts")
                    .font(.caption.monospaced())
                    .foregroundStyle(alreadyExists ? .red : .secondary)
            }
            if alreadyExists {
                Label("A \(kind.singular.lowercased()) with that name already exists.",
                      systemImage: "exclamationmark.triangle")
                    .font(.callout).foregroundStyle(.orange)
            }
            if let error {
                Label(error, systemImage: "xmark.circle")
                    .font(.callout).foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                Button("Create") { create() }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canCreate)
            }
        }
        .padding(20)
        .frame(width: 460)
        .onAppear {
            if typeText.isEmpty {
                typeText = kind == .triggers ? "pageview" : (kind == .variables ? "datalayer" : "")
            }
        }
    }

    private func create() {
        working = true
        defer { working = false }
        do {
            try AssetFactory.create(
                kind: kind,
                id: slug,
                name: slug,
                description: descriptionText,
                type: typeText,
                key: keyText,
                value: valueText,
                patterns: patternsText
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces) }
                    .filter { !$0.isEmpty },
                projectPath: state.projectPath
            )
            let created = slug
            Task {
                await state.refresh()
                state.showToast("Created \(created)")
                onCreated(created)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// Writes new asset source files.
enum AssetFactory {

    enum FactoryError: LocalizedError {
        case noProject
        case exists(String)
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .noProject: return "No project is open."
            case .exists(let p): return "\(p) already exists."
            case .writeFailed(let m): return "Could not write the file: \(m)"
            }
        }
    }

    static func fileURL(kind: AssetKind, id: String, projectPath: String) -> URL? {
        guard !projectPath.isEmpty else { return nil }
        let url = URL(fileURLWithPath: projectPath)
            .appendingPathComponent("yourtm/\(kind.rawValue)/\(id).ts")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static let defineFn: [AssetKind: String] = [
        .tags: "defineTag", .triggers: "defineTrigger",
        .variables: "defineVariable", .zones: "defineZone",
    ]

    /// Single-quoted TS string literal, matching the style of the hand-written
    /// sources rather than the double quotes ts-morph emits on edit.
    private static func quoted(_ s: String) -> String {
        "'" + s.replacingOccurrences(of: "\\", with: "\\\\")
               .replacingOccurrences(of: "'", with: "\\'") + "'"
    }

    static func create(
        kind: AssetKind, id: String, name: String, description: String,
        type: String, key: String, value: String, patterns: [String],
        projectPath: String
    ) throws {
        guard !projectPath.isEmpty else { throw FactoryError.noProject }
        let dir = URL(fileURLWithPath: projectPath)
            .appendingPathComponent("yourtm/\(kind.rawValue)")
        let file = dir.appendingPathComponent("\(id).ts")
        if FileManager.default.fileExists(atPath: file.path) {
            throw FactoryError.exists("yourtm/\(kind.rawValue)/\(id).ts")
        }

        var lines = ["  name: \(quoted(name))"]
        if kind == .triggers || kind == .variables, !type.isEmpty {
            lines.append("  type: \(quoted(type))")
        }
        if kind == .variables, type == "datalayer", !key.isEmpty {
            lines.append("  key: \(quoted(key))")
        }
        if kind == .variables, type == "constant" {
            lines.append("  value: \(quoted(value))")
        }
        if kind == .zones {
            let list = patterns.map(quoted).joined(separator: ", ")
            lines.append("  patterns: [\(list)]")
            lines.append("  priority: 10")
        }
        if !description.isEmpty {
            lines.append("  description: \(quoted(description))")
        }

        let fn = defineFn[kind] ?? "defineTag"
        let source = """
        import { \(fn) } from '@yourtm/core'

        export default \(fn)({
        \(lines.joined(separator: ",\n")),
        })

        """

        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try source.write(to: file, atomically: true, encoding: .utf8)
        } catch {
            throw FactoryError.writeFailed(error.localizedDescription)
        }
    }
}
