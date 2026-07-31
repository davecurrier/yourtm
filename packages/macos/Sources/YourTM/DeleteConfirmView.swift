import SwiftUI

/// Delete confirmation for one asset or many.
///
/// Anything still referenced blocks the delete and is listed so you can go
/// unhook it. References *within the selection* are ignored: deleting a trigger
/// together with the only tags that fire on it is coherent, and refusing that
/// would make bulk delete useless exactly when it is most wanted.
struct DeleteConfirmView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss

    let assets: [Asset]
    let kind: AssetKind
    var onDeleted: () -> Void

    @State private var deleting = false
    @State private var progress: Int = 0
    @State private var error: String?
    @State private var failures: [String] = []

    init(asset: Asset, kind: AssetKind, onDeleted: @escaping () -> Void) {
        self.assets = [asset]
        self.kind = kind
        self.onDeleted = onDeleted
    }

    init(assets: [Asset], kind: AssetKind, onDeleted: @escaping () -> Void) {
        self.assets = assets
        self.kind = kind
        self.onDeleted = onDeleted
    }

    /// References from assets that will still exist afterwards.
    private var blocking: [(asset: Asset, refs: [Reference])] {
        let index = ReferenceIndex(project: state.project)
        let doomed = Set(assets.map(\.id))
        return assets.compactMap { a in
            let refs = index.references(to: a, kind: kind)
                .filter { !doomed.contains($0.assetId) }
            return refs.isEmpty ? nil : (a, refs)
        }
    }

    private var inUse: Bool { !blocking.isEmpty }
    private var isBulk: Bool { assets.count > 1 }
    private var noun: String { isBulk ? "\(assets.count) \(kind.rawValue)" : assets.first?.name ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: inUse ? "exclamationmark.shield" : "trash")
                    .font(.system(size: 26))
                    .foregroundStyle(inUse ? .orange : .red)
                VStack(alignment: .leading, spacing: 2) {
                    Text(headline).font(.headline)
                    Text(detail)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if inUse {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(blocking, id: \.asset.id) { entry in
                            if isBulk {
                                Text(entry.asset.name)
                                    .font(.callout.weight(.semibold))
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 10).padding(.top, 8).padding(.bottom, 2)
                            }
                            ForEach(entry.refs) { ref in
                                HStack(spacing: 8) {
                                    Image(systemName: ref.kind.systemImage)
                                        .font(.caption).foregroundStyle(.secondary).frame(width: 14)
                                    Text(ref.assetName).font(.callout.weight(.medium))
                                    Text(ref.role).font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                }
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                Divider().opacity(0.4)
                            }
                        }
                    }
                }
                .frame(maxHeight: 220)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))

                if isBulk, blocking.count < assets.count {
                    Text("The other \(assets.count - blocking.count) are unreferenced and can be deleted on their own.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            } else if isBulk {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(assets) { a in
                            HStack(spacing: 8) {
                                Image(systemName: kind.systemImage)
                                    .font(.caption).foregroundStyle(.secondary).frame(width: 14)
                                Text(a.name).font(.callout)
                                Spacer()
                                Text(a.sourcePath ?? "yourtm/\(kind.rawValue)/\(a.id).ts")
                                    .font(.caption.monospaced()).foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal, 10).padding(.vertical, 4)
                        }
                    }
                }
                .frame(maxHeight: 220)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
            }

            if !failures.isEmpty {
                Label("Could not delete: \(failures.joined(separator: ", "))",
                      systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.orange)
            }
            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.orange).textSelection(.enabled)
            }

            HStack {
                if deleting, isBulk {
                    Text("\(progress) of \(assets.count)…")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button(inUse ? "OK" : "Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                if !inUse {
                    Button(deleting ? "Deleting…" : (isBulk ? "Delete \(assets.count)" : "Delete")) {
                        Task { await performDelete() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(deleting)
                }
            }
        }
        .padding(20)
        .frame(width: 460)
    }

    private var headline: String {
        if inUse {
            return isBulk ? "\(blocking.count) of \(assets.count) are in use" : "\(noun) is in use"
        }
        return isBulk ? "Delete \(noun)?" : "Delete \(noun)?"
    }

    private var detail: String {
        if inUse { return "Remove these references first, then delete." }
        if isBulk { return "Nothing outside the selection references them. This deletes \(assets.count) source files." }
        return "Nothing references it. This deletes \(assets.first?.sourcePath ?? "its source file")."
    }

    private func performDelete() async {
        deleting = true
        progress = 0
        failures = []
        defer { deleting = false }

        for asset in assets {
            do {
                try AssetFactory.delete(kind: kind, id: asset.id, projectPath: state.projectPath)
                progress += 1
            } catch {
                // Keep going: one bad file should not strand the rest.
                failures.append(asset.name)
            }
        }

        await state.refresh()
        if failures.isEmpty {
            state.showToast(assets.count == 1 ? "Deleted \(assets[0].name)" : "Deleted \(progress) \(kind.rawValue)")
            onDeleted()
            dismiss()
        } else {
            state.showToast("Deleted \(progress) of \(assets.count)")
            onDeleted()
        }
    }
}
