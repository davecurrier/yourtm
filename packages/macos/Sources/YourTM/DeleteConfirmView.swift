import SwiftUI

/// Delete confirmation. If the asset is referenced anywhere, deletion is
/// blocked and the references are listed so you can go unhook them first.
struct DeleteConfirmView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss

    let asset: Asset
    let kind: AssetKind
    var onDeleted: () -> Void

    @State private var deleting = false
    @State private var error: String?

    private var refs: [Reference] {
        ReferenceIndex(project: state.project).references(to: asset, kind: kind)
    }
    private var inUse: Bool { !refs.isEmpty }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: inUse ? "exclamationmark.shield" : "trash")
                    .font(.system(size: 26))
                    .foregroundStyle(inUse ? .orange : .red)
                VStack(alignment: .leading, spacing: 2) {
                    Text(inUse ? "\(asset.name) is in use" : "Delete \(asset.name)?")
                        .font(.headline)
                    Text(inUse
                         ? "Remove these references first, then delete."
                         : "Nothing references it. This deletes \(asset.sourcePath ?? "its source file").")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if inUse {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(refs) { ref in
                        HStack(spacing: 8) {
                            Image(systemName: ref.kind.systemImage)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 14)
                            Text(ref.assetName).font(.callout.weight(.medium))
                            Text(ref.role).font(.caption).foregroundStyle(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        Divider().opacity(0.4)
                    }
                }
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 6))
                .frame(maxHeight: 200)
            }

            if let error {
                Label(error, systemImage: "exclamationmark.triangle")
                    .font(.caption).foregroundStyle(.orange)
                    .textSelection(.enabled)
            }

            HStack {
                Spacer()
                Button(inUse ? "OK" : "Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                if !inUse {
                    Button(deleting ? "Deleting…" : "Delete") {
                        Task { await performDelete() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(deleting)
                }
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private func performDelete() async {
        deleting = true
        defer { deleting = false }
        do {
            let result = try await state.api.deleteAsset(kind: kind, id: asset.id)
            if result.success == false {
                error = result.error ?? "Delete failed"
                return
            }
            await state.refresh()
            state.showToast("Deleted \(asset.name)")
            onDeleted()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
